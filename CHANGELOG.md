# Changelog

All notable changes to Astra Deck are documented here. Versions are listed newest-first.

---

## [Unreleased]

### Added
- **Client-side mark as watched.** Video Hider now offers an opt-in per-card
  control with capped LRU storage, export/import support, dim-or-remove feed
  behavior, and Undo toasts for both marking and unmarking.
- **Bounded inactive-channel unsubscribe.** Subscription Groups can now apply
  YouTube's unsubscribe action only to the staged stale-channel review list,
  in 25-item sessions paced at 400 ms, while retaining failed items, recording
  per-channel results locally, and exporting the capped session log as JSON.
- **Content-script startup budget.** A headless fixture benchmark now tracks
  parse-plus-init and first-feature-paint medians, and the repository check
  rejects regressions beyond the recorded tolerance.

### Fixed
- **Audio sync offset.** The shared MAIN-world audio graph now exposes a
  bounded, off-by-default -500 ms to +500 ms control, applies positive delay
  changes live through a cached `DelayNode`, and returns to a dry source path
  at zero without rebuilding the media source across SPA navigation.
- **Selector localization hardening.** Watch action and masthead controls now
  resolve through structural selector-pack hooks before any English fallback;
  selector health records fallback misses, and the check suite blocks new
  aria-label selectors outside the pack layer.
- **Companion cold-start recovery.** Every normal and user-facing retry path
  now shares the documented 12-second auto-start poll budget, while the
  fast-fail path for a never-installed companion remains short.
- **UI-copy localization gate.** Watch Later cleanup labels, save guidance,
  channel-age tooltips, and their accessible names now resolve through locale
  keys; the copy gate also fingerprints new direct literals at text, title,
  aria-label, and toast sinks with reviewed brand/format exceptions.
- **Companion port catalogue.** One validated JSON catalogue now generates the
  Python fallback constants, extension probe lists, background allowlists,
  build-profile permissions/CSP, and manifest parity checks.

### Changed
- **Behavioral coverage.** Dedicated download-manager and subscription-group
  suites now pin companion fallback probing, repair guidance, cold-start retries,
  recovery-code copy, group editing, sorting, and import counters.

## [4.51.1] - 2026-08-02 (companion v1.7.0)

### Added
- **Scheduled subscriptions.** Astra Downloader now stores channel and playlist
  schedules in a schema-checked `subscriptions.json`, scans on a bounded
  scheduler, and keeps a durable archive so new uploads are queued once across
  restarts. The GUI adds a Subscriptions page, authenticated CRUD/scan routes,
  and Subscription Groups can schedule their channel members from the extension.

### Fixed
- **Companion exception observability.** The release check now rejects
  pass-only Python exception handlers without an explicit reason, and process
  termination/watchdog failures are recorded at warning level.
- **Cookie-jar permissions.** Companion YouTube cookie jars now receive and
  verify an owner-only ACL before any cookie bytes are written; ACL failures
  abort the download with a retryable classified error.
- **Inline theme coherence.** Subscription cards and dialogs now render cleanly in YouTube light mode, shared accent RGB tokens drive utility surfaces, RTL-sensitive margins use logical properties, and bottom-right overlays stack from measured heights.
- **Companion naming.** Download progress, format probing, and full-profile
  welcome copy now consistently identify the helper as Astra Downloader.
- **Undo status copy.** Removed unreachable no-undo branches and their
  obsolete locale catalog entries; recoverable import/reset flows now expose
  only the statuses they can actually reach.
- **Build-tool cleanup.** Removed unused shell and companion-validator bindings
  from the local release tooling.
- **Userscript version integrity.** Release checks now validate the visible
  `YTKit.user.js` `@name` version suffix alongside `@version`.
- **Schema generator safety.** The legacy schema command now delegates to the
  canonical parity check and cannot overwrite the hand-maintained schema.
- **Companion translation freshness.** Release builds now fail closed when an
  unavailable Qt compiler would leave a stale `.qm` catalogue.
- **Firefox native messaging bootstrap.** Astra Downloader now recognizes
  Firefox's registered-host manifest path plus Gecko extension ID argv shape,
  validates it against the installed manifest, and enters the stdio token
  handshake before GUI or single-instance startup.
- **Resume Playback persistence.** Mid-video samples now queue durable storage
  writes on a bounded cadence and force a final flush on `pagehide` and feature
  teardown, so closing a tab no longer loses the saved position.
- **Video Hider type detection.** Live and upcoming checks now inspect only
  badge and metadata rows, so ordinary titles containing those words remain
  visible while genuine live/upcoming cards are still filtered.
- **Video Hider locale parsing.** View and subscriber counts now parse
  localized labels, compact suffixes, grouping separators, and non-Latin
  digits so low-view filters and subscriber predicates work across locales.
- **Video Hider localized card types.** Live, upcoming, Mix, and playlist
  predicates now prefer structural card markers and recognize localized
  metadata across Latin, CJK, Cyrillic, and RTL labels.
- **Video Hider predicate metadata.** Advanced local predicates now receive
  card-derived upload age, Shorts, and members-only values, using `null` when
  YouTube does not expose enough card evidence instead of false zeroes.
- **Transcript AI handoff teardown.** Delayed button injection timers now
  cancel on navigation rescheduling and feature teardown, preventing an
  orphaned handoff control after the feature is disabled.
- **Download filename bounds.** The background filename sanitizer now applies
  its 180-character cap after rebuilding long extension-like tails.
- **Transcript request cancellation.** Abort signals now reject in-flight
  extension requests promptly and cancel retry backoff without crossing the
  runtime message boundary.
- **Cold-start reveal persistence.** Completed downloads now wait for the
  session reveal mirror to hydrate before adding a new pending folder reveal.
- **Cobalt endpoint honesty.** The extension now rejects self-hosted Cobalt
  origins before the fetch bridge and explains that custom endpoints require
  the userscript vehicle.
- **Import recovery visibility.** Undo Import now reconciles its visibility
  from the finalizer even when coordinated rollback fails.
- **Live-chat gate coverage.** The dedicated live-chat loader now receives the
  same ESLint and no-eval enforcement as the other shipped top-level scripts,
  with inventory tests preventing future manifest drift.
- **Player-control SPA teardown.** A-B Loop, fine speed, PiP, loop, subtitle,
  visual-filter, and chapter controls now remove stale DOM elements during
  navigation and sweep orphaned controls during teardown.
- **Watch-time multi-tab merging.** Watch Time Tracker now keeps this tab's
  unflushed seconds as a delta and rebases them over external ledger updates;
  Takeout import and undo remain authoritative replacements.
- **Companion download input hardening.** Non-string format and quality values
  now return CORS-preserving 400 validation responses or restore to safe queue
  defaults instead of raising TypeError.
- **Cookie-less retry cancellation.** Cancelling during the live-stream retry
  spawn window now terminates the newly spawned yt-dlp process immediately.
- **Native-host config ownership.** Browser bootstrap now reads configuration
  without rewriting `config.json`, preventing native-host launches from
  racing GUI settings saves or rotating the active token.
- **History CSV safety.** Exported history cells now neutralize spreadsheet
  formula prefixes so untrusted video titles remain literal when opened.
- **Windows update probe timeout.** Detached companion health checks now have
  a 30-second bound and kill hung staged processes so rollback and relaunch can
  proceed.
- **Folder picker timeout cleanup.** Timed-out folder-picker requests are now
  cancelled and discarded by the GUI bridge instead of opening a later ghost
  dialog.
- **Non-blocking health probes.** Version, ffmpeg-capability, and
  JavaScript-runtime cache locks no longer cover their subprocess work, keeping
  concurrent health/readiness calls responsive during cold probes.
- **Stateless user regex filters.** Comment and video filters now ignore
  global/sticky flags that would otherwise make repeated `.test()` calls skip
  matches.
- **Transcript navigation reset.** Moving to a new video now clears the prior
  translation state so the first Translate action applies to the new transcript.
- **Digital Wellbeing resume.** The break reminder now resumes playback when it
  was the thing that paused an active video, while respecting an already-paused video.
- **Per-channel speed reset.** Returning a channel to the default 1× rate now
  removes its saved override, and SPA navigation saves the outgoing rate under
  the channel that owned the departing video.
- **Focused Mode page scope.** Focused Mode now activates only on watch pages,
  so its masthead and guide rules cannot hide navigation site-wide.
- **Bulk card action teardown.** Interrupted recommendation scrubs now stop
  cleanly and retain a partial local session record; Bulk Hide owns a fallback
  hidden-card rule when Video Hider storage is unavailable.
- **Video Hider quota sweep.** The five-minute quota guard now prunes the real
  top-level hidden-video and blocked-channel stores instead of dead settings
  keys, retaining their newest bounded entries.

## [4.51.0] - 2026-08-02 (companion v1.6.0)

### Added
- **Native companion localization scaffold.** The Qt GUI now resolves system
  or user-selected language preferences across the same 11 locale IDs as the
  extension, routes shared labels and controls through Qt translation
  catalogues, and packages compiled `.qm` resources in the Windows executable.
  A deterministic German dashboard render pins the non-English build path.
- **Opt-in clipboard link staging.** Astra Downloader can watch clipboard
  changes for strict YouTube URLs, stage each unique match in Quick download,
  and prompt for review without ever starting a download automatically.
  Non-YouTube content is ignored and the privacy-sensitive watcher is off by
  default.
- **Bounded playlist previews and subset downloads.** Playlist-aware extension
  dialogs can preview up to 200 flat items, choose an explicit subset, and send
  only normalized item indexes to the authenticated companion. The durable
  queue preserves that selection and yt-dlp receives one reviewed
  `--playlist-items` value without exposing arbitrary client flags.
- **Frame-accurate clip downloads.** The extension download dialog and native
  companion now accept start/end timestamps, validate and persist the range,
  download the complete source through the existing safe yt-dlp path, and
  atomically replace it with an ffmpeg re-encode at the requested boundaries.
- **Download history is fully accessible.** The companion and in-page History
  surfaces now search title/filename, filter status/format/saved dates, sort
  newest or oldest, page through the retained 500-row store in bounded 50-row
  slices, show filtered and retained totals, and export all matching rows to
  CSV.
- **Deterministic companion operational-state visual QA.** The Qt smoke renderer
  now captures server startup/online/degraded states, the complete queue and
  recovery lifecycle, history clear/Undo, Settings dirty/error/busy states, and
  900x620 large-font reflow at 2× DPI. Every fixture uses the native whole-window
  backing store, including the real navigation rail.
- **Preferred, descriptive, and original audio now use one MAIN-world player
  bridge.** Language selection prefers an exact BCP-47 match, falls back to the
  primary language, can favor same-language audio description, and reapplies
  safely after YouTube SPA navigation without opening the native settings menu.
- **Mutation-rule health circuits.** Shared broad and selector-scoped mutation
  rules now track route-local invocation and runtime budgets, isolate noisy
  rules behind per-feature circuits, reset on SPA navigation or explicit retry,
  and surface degraded feature IDs in selector-health diagnostics.

### Added
- **Power-efficient codec mode.** A new Codec Selector option asks this device
  which codec it decodes both smoothly and power-efficiently, then prefers only
  that one. When the browser has no answer, rejects the query, or reports every
  supported codec as equally efficient, it changes nothing — YouTube's own
  selection stands.
- **The download dialog can ask what this video actually has.** A "Check
  available" control in the quality row calls the companion's format endpoint
  and strikes out every resolution the video cannot honor — asking for 4K on a
  720p upload, or 480p on a video whose lowest stream is 1080p, previously
  looked like it worked while yt-dlp quietly downloaded something else. A
  selection that stops being valid falls back to Best and says so.

### Removed
- **The unused API limiter no longer loads on every page.** It had no consumers
  since it shipped, and its queue could serialize work regardless of the
  configured capacity and stall permanently on a task that never settled.

### Changed
- **Microcopy pass.** One ellipsis and one dash convention across the interface,
  side-panel labels no longer borrow wording from unrelated surfaces, the
  disabled "Mark all read" control explains that nothing is new, and the
  companion's maintenance copy now describes what it actually does — yt-dlp is
  checked at most every twelve hours (at start and when the queue goes idle),
  and a refreshed ffmpeg replaces the installed copy only after it verifies.
- **Importing subscription groups merges instead of replacing.** An import used
  to delete every group missing from the file, recoverable only through a
  six-second toast. Imports now merge — existing groups and their channels
  survive, imported records win on name and color — and the destructive
  replace-everything path takes a deliberate Shift+click on Import.

### Security
- **The companion update check follows the published Release, not a branch.**
  Whether an update exists was decided by reading the version from `main`, so a
  premature or bad commit could drive update logic before any release existed.
  The version now comes from the newest published Release tag — draft and
  pre-release entries are ignored, the tag shape is validated before it reaches
  a URL, and no release means no update.

### Fixed
- **Failures a PO-token provider would fix now say so.** No token-free client
  covers the whole catalogue, so age-gated, members-only, and SABR-limited
  downloads fail with advice that never mentioned the one thing that fixes
  them. Those failures now name the provider when none is running — and stay
  quiet when one is. Bare `LOGIN_REQUIRED` / `UNPLAYABLE` playability statuses,
  previously unclassified, are recognised as sign-in failures.
- **The cookie-less retry for ended live streams shares one parser.** It ran a
  cloned copy of the progress parser with no test coverage, which had already
  drifted — a late output line could flip a cancelled download back to
  "merging". Both attempts now use the same code, covered by tests for cookie
  stripping, retry progress, and the cancelled guard.
- **Video Insights distinguishes "not looked up" from "not published".** A
  paused, blocked, or failed metadata lookup rendered exactly like a video that
  published no category or tags. The panel now says the lookup did not run and
  marks those fields as unchecked.
- **Custom filter predicates follow JavaScript's `!` precedence.** `!ctx.a ===
  true` was evaluated as `!(ctx.a === true)` — the opposite result for an
  expression written to look like JavaScript. Predicates that relied on the old
  grouping need explicit parentheses.
- **Chat-style comments stop restyling the whole thread on every change.** Each
  batch of new comments re-applied roughly thirty inline styles to every
  comment already on the page; comments that are still styled are now skipped,
  and one whose markup YouTube replaced is detected and restyled.
- **The subscriptions feed says who is ordering it.** With Subscription Groups
  active, the saved feed order stopped applying because the group toolbar's
  Sort owns ordering — with nothing on screen explaining the change. The view
  controls now say so.
- **Three toggles now work outside English.** Hide Create button, the live-chat
  popout entry, and the live-chat subscribe-privacy tooltip were matched by
  English label or sentence text, so they silently did nothing on the other ten
  shipped languages. They now match language-independent markup, keeping the
  English anchors as fallbacks.
- **Watch-time limits count every tab.** Each tab wrote its own absolute daily
  total, so two tabs playing at once overwrote each other and break reminders
  and the daily cap arrived late. Tabs now merge their own counted seconds into
  the shared total and flush them when the tab is hidden or closed instead of
  losing up to half a minute.
- **Watch Later bulk removal can no longer remove the wrong video.** YouTube
  serves every row menu from one shared dropdown; removal waited a fixed
  fraction of a second and clicked whatever it found, which on a slow rebind
  was still the previous row's entry. It now waits for the row's own menu and
  aborts if the menu names a different video.
- **The play queue stays consistent across tabs.** Queue rows now act on the
  video they were rendered for instead of a row position, so an edit made in
  another tab can no longer cause Remove to delete the wrong entry; the pill
  and panel follow other tabs' changes; and two tabs whose videos end together
  no longer both jump to the same next video.
- **Theater Split keeps the player full width after leaving fullscreen.**
  Exiting fullscreen with the split collapsed pinned the player to the pixel
  width the window happened to have, and nothing corrected it on a later
  resize until the split was expanded again.
- **A failed settings-import rollback no longer reports success.** Rollback and
  Undo waited for nothing, so the same storage failure that forced the rollback
  could silently fail the restore while the UI said the previous state was
  back. Both now confirm their writes, and a rejected restore keeps the undo
  checkpoint so recovery can be retried.
- **Settings search no longer makes unavailable sub-settings look available.**
  Searching cleared the dimming on sub-settings whose parent is off while
  leaving them inert, so a matching card looked enabled and ignored every
  click. They now stay dimmed and labelled unavailable while they match.
- **Section Reset and its Undo now cover every setting in the section.** Both
  keyed on the feature id, so features that store under a different key —
  playback speed, theme, custom CSS and about twenty more — were skipped
  entirely, and only checkboxes were refreshed, leaving dropdowns, sliders and
  color pickers displaying the value that had just been reset away.
- **Settings explains a session-only port fallback.** When the configured port
  is taken at startup the companion binds a fallback for that session; the
  Settings page now says so next to the port control instead of silently
  disagreeing with the dashboard, and the control itself always shows the
  configured port rather than echoing the fallback back into the saved config.
- **DeArrow voting and the peek overlay work again.** The shipping DeArrow
  module never wrote the `data-ytkit-dearrow-uuid` / `data-ytkit-orig-title`
  attributes those two features query, so voting found nothing to vote on and
  holding Alt revealed an empty overlay.
- **Monolith fallback copies match their peeled modules.** The DeArrow,
  SponsorBlock, and Return YouTube Dislike objects in `ytkit.js` — used when a
  feature content script fails to load — had drifted for months. They now carry
  the route-token and lazy-image guards, the self-disarming progress-bar
  observer, anti-adblock detection, skip-timing jitter, API health reporting,
  and the debounced cache persist with an unload flush and teardown guard.
- **Custom filename templates cannot overrun the maximum path length.** Free-text
  expansions (`%(title)s`, `%(uploader)s`, `%(channel)s`, playlist titles) are
  now length-bounded when the template is saved, with the byte budget split
  across the fields a template actually uses and over-generous explicit bounds
  clamped. Previously only the built-in templates were bounded, so a long title
  under a deep download folder failed with an opaque file error.
- **Companion status accessibility.** Sidebar, dashboard, readiness, setup,
  download-progress, settings, and log surfaces now expose descriptive
  accessible names and retain text alongside every color cue. Audited status
  colors meet WCAG AA, and page fades honor the Windows reduced-animation
  preference.
- **Download progress no longer rebuilds the queue UI.** The companion keys
  cards by download ID and patches volatile labels, progress, and recovery
  copy in place. Structural state changes replace only the affected card, so
  scrolling and keyboard focus survive the 500 ms refresh loop.
- **Side dashboard RTL and reflow.** Search controls, empty/timing metadata,
  list spacing, busy indicators, and switches now use logical geometry. The
  rendered accessibility smoke covers Arabic at 200% zoom in both Chromium
  sidepanel and Firefox sidebar shells.
- **Settings Undo is keyboard-reachable.** Actionable toasts join the open
  Settings dialog focus cycle, skip unrelated page controls between DOM roots,
  and remain available until the user activates or dismisses them.
- **Remaining named in-page English surfaces now use the locale catalog.**
  Subscription digest/health, video notes, downloader setup/health/history,
  Settings search/reset/insights, transcript export/translation, bulk actions,
  popup maintenance statuses, and toast chrome resolve through `t()`. Locale
  extraction now covers feature modules, gates missing English keys, and keeps
  Arabic and Simplified Chinese in generated-catalog parity.
- **Popup data recovery now works without an open YouTube tab.** Export writes
  a truthful extension-only backup that marks the transcript index unavailable;
  Import and Reset keep local rollback/Undo guarantees while leaving inaccessible
  YouTube-origin transcript data unchanged and reporting the partial result.
- **Companion first paint no longer waits on executable probes.** The Settings
  maintenance row now renders a checking state immediately and refreshes
  yt-dlp/ffmpeg versions through the existing worker-backed signal after
  `MainWindow` construction.

## [4.50.7] - 2026-07-28

Deep-audit release (companion v1.5.6). Four parallel auditors over the
v4.50.2–v4.50.6 wave; ~20 verified findings fixed across correctness,
security posture, UX, theming, i18n, and release distribution.

### Fixed
- **Session-only port fallback truly session-only.** The bind-conflict
  fallback wrote the fallback port into the shared config dict, and any later
  full-config save (yt-dlp update-check timestamp, ffmpeg setup stamp,
  settings save) persisted it — permanently rewriting the user's configured
  port, the exact bug the v4.50.6 fix set out to prevent. Config now has a
  session-override layer excluded from every save, and an unrelated settings
  save during a fallback session no longer surprise-restarts the server.
- **yt-dlp auto-update no longer races the download that triggered it.** The
  v1.5.4 download-initiated trigger fired before the download was enqueued,
  so the updater passed its idle gate and its binary swap collided with the
  yt-dlp.exe spawned milliseconds later (file-in-use failure + a wasted full
  release re-download). The race-free server-start and queue-idle hooks cover
  staleness on their own.
- **Invalid filename templates are flagged, not silently discarded.** A
  rejected template used to save "successfully" while sanitize blanked it to
  the default naming; the field now shows a clear validation error, and the
  validator additionally rejects broken printf syntax (unclosed `%(field`,
  stray `%`) that previously failed every download with an opaque yt-dlp
  startup error.
- **Completion toasts fire for a taskbar-minimized window**, matching the
  "while minimized" setting label (was hidden-to-tray only).
- **Settings pane header alignment.** The "Enable all" actions block floated
  into the middle column on panes without select-type features (Comments,
  Live Chat, Video Hider) and on every pane during search; it is now pinned
  to the header's end column.
- **Repair prompt stays truthful.** The port-squatter description re-renders
  on every retry/recheck instead of blaming a program the user already
  closed; first-time users see the install prompt again (the retry/install
  mode ternary was always retry on the download path); and with no native
  host and no responding port, the futile 12s "Starting…" poll is skipped.
- **Per-feature reinit debounce.** A range drag and a color input within
  300ms shared one debounce timer (module + monolith), cancelling the first
  feature's pending apply.
- **Monolith RYD fallback cache-clobber** ported from the module fix.
- **/formats concurrency bounded.** Concurrent yt-dlp probe processes are
  capped (2) with a 429 `formats-busy` + Retry-After response — saturating
  format lookups could occupy the whole HTTP worker pool for up to 60s and
  starve /health//status//download.
- **SABR pill via the async readiness probe.** No more cold 5s yt-dlp
  subprocess on the GUI thread during window construction; the pill also
  refreshes after setup installs or updates yt-dlp.
- **Post-save status clear is generation-guarded** so it can't wipe a newer
  "Unsaved changes" indicator written within 3.2s of a save.
- **Test isolation.** The companion suite no longer appends fabricated
  failure lines to the production `server.log`.

### Changed
- **Companion download links point at a release that carries the binary.**
  The v1.5.6 `AstraDownloader.exe` (+ SHA-256 sidecar) ships with this
  release, restoring the companion's `/update` self-update path (the
  `releases/latest` alias had 404'd since v4.47.0 because no newer release
  carried the exe) and retiring the v4.46.4-era pinned installer.
- **Userscript downloader parity.** Cold-start poll window widened to
  8 × 1.5s to match the extension, and port-squatter detection + the named
  repair message ported to the GM implementation.
- **i18n.** Sidebar nav-group labels and the pane-context ARIA label are now
  localized in all 11 locales (were English-only); the ARIA label uses a
  `{category}` placeholder template.
- **Theming.** Nine stale inline companion colors from the superseded
  premium palette snapped to the active quiet-desktop tokens; active
  stylesheet radii aligned to the sanctioned 4/6 scale.

## [4.50.6] - 2026-07-27

### Added
- **Configurable filename template.** A new "Filename template" setting (companion Storage settings) accepts a yt-dlp output template relative to the download folder (e.g. `%(uploader)s/%(title)s.%(ext)s`). Validated against a field allowlist with no path traversal and a required `%(ext)s`; blank uses the default.
- **Download-complete tray notification.** When a download finishes while the
  companion window is minimized to the tray, a one-shot notification is raised
  (toggle in Tray behavior settings, on by default).
- **Configurable simultaneous downloads and retries.** New "Simultaneous
  downloads" (1–10, default 3 — previously a hardcoded limit) and "Download
  retries" (0–50, default 10) settings in the companion's Performance settings;
  retries map to yt-dlp `--retries`/`--fragment-retries`.
- **Per-URL format listing (`POST /formats`).** The companion can now report a
  video's real available formats (id, ext, resolution, codec, filesize, has
  audio/video) via yt-dlp `-J`, run under the same extractor + JS-runtime
  conditions as an actual download. Auth + rate-limited + YouTube-allowlisted
  exactly like `/download`; enables a real format picker instead of a static
  quality list.

### Fixed
- **Transient port conflicts no longer rewrite the configured server port.**
  When the primary port is briefly held (e.g. by a stale instance), the
  companion binds a fallback for that session only instead of permanently
  saving it — the user's chosen port is retried on the next start once the
  conflict clears.

### Security
- **`/shutdown` is now POST-only** (was a state-changing GET), aligning with
  safe-method semantics for the loopback API; GET returns 405.

### Changed
- **SABR support status reflects the real yt-dlp binary.** The `/health` `sabrSupport` field and the readiness pill are now derived from the installed yt-dlp's capability (`evaluate_sabr_support`) instead of a hardcoded "limited" string; flips to "supported" automatically once yt-dlp ships the native SABR downloader (PR #13515).
- **Companion tracks the yt-dlp nightly channel by default.** yt-dlp updates now
  run `--update-to <channel>@latest` instead of the channel-locked `-U`, and a
  new "yt-dlp update channel" setting (Nightly/Stable, default Nightly) is in
  the companion's Performance settings. Nightly ships same-day YouTube extractor
  fixes; the monthly stable channel lagged breakage by weeks. Rollback is
  unchanged.

## [4.50.5] - 2026-07-27

### Changed
- **Auto-start the companion on download with a cold-start-safe wait.**
  Initiating a download while Astra Downloader is stopped already fires the
  registered `mediadl://start` protocol to launch it, but the initial attempt
  used the shortest poll window (4 × 1.5s ≈ 6s) — too tight for a cold start of
  the 40 MB one-file companion (self-unpack + Qt init + server bind can take
  8–10s). The initial auto-start now waits up to 8 × 1.5s ≈ 12s, so a download
  clicked against a stopped companion reliably starts it and proceeds instead of
  falling through to the install/repair prompt. (Requires the companion to have
  run once so the protocol is registered; the first protocol launch shows a
  one-time browser "Open Astra Downloader?" confirmation.)

## [4.50.4] - 2026-07-27

### Changed
- **yt-dlp now auto-updates from the download path, not just at startup.**
  YouTube regularly breaks older yt-dlp builds, so a companion that stayed
  running for days could go stale between the rare server restarts that were
  the only auto-update trigger. The companion (v1.5.4) now opens the throttled,
  race-safe yt-dlp update window when a download is **initiated** and again when
  the **queue drains to idle** (the race-free moment to swap the binary). The
  updater still stages a sibling copy, verifies `--version`, keeps a
  byte-verified rollback, and only replaces the live binary when no download is
  running — so in-flight downloads are never blocked or corrupted. Check
  throttle lowered 24h → 12h. This keeps yt-dlp current without shipping a new
  extension or companion build: fresh yt-dlp releases land automatically the
  next time the user downloads.

## [4.50.3] - 2026-07-27

### Fixed
- **Downloads silently routed to a stale/legacy companion.** The extension
  probes `127.0.0.1:9751` (the companion's primary port) first and adopted any
  server that answered `/health`. A leftover legacy downloader (e.g. an old
  "YTYT-Downloader" started from a Startup shortcut) could squat that port with
  a months-old bundled yt-dlp, so every download failed even though the real
  Astra Downloader was running fine on a fallback port. `MediaDLManager` now
  records the shadowing server it skips, and the repair prompt names the exact
  port + version and points at Startup apps instead of failing with a generic
  "not installed" message.
- **Companion surfaced benign warnings as the failure reason.** A failed
  download whose output contained only yt-dlp WARNING noise (most notoriously
  "Your yt-dlp version … is older than 90 days") reported that warning as the
  error, masking the true cause. The companion (v1.5.3) now filters benign
  warning/progress lines, falls back to a clear exit-code message, and attaches
  an actionable failure classification (advice + next action).

## [4.50.2] - 2026-07-26

### Changed

- Re-imagined the in-page Settings workspace as a premium control center:
  grouped category navigation, live category preference summaries, visible
  setting glyphs, a contained control canvas, clearer live-apply state, and
  stronger footer actions across desktop, mobile, light, dark, and RTL modes.

### Fixed

- Compact Layout no longer overrides YouTube's reserved playlist/show sidebar
  offset, preventing playlist rows from sliding underneath the fixed playlist
  card on the current `page-subtype="playlist"` layout. Hide Sidebar now also
  re-anchors that fixed card to the full-width page instead of leaving it at
  YouTube's removed 240px guide offset.
- Age-restriction/player-warning endpoints are hidden in their watch-page error
  and title-metadata contexts without globally suppressing the same generic
  endpoint class used by channel and product links.
- The local Firefox lint toolchain now resolves `brace-expansion` to the
  patched 5.0.8 release, clearing the current unbounded-expansion audit finding
  without downgrading `web-ext`.
- The Settings and recovery actions now download the real
  `AstraDownloader.exe` asset from GitHub release `v4.46.4`; the former
  `releases/latest/download` alias resolved against an extension-only release
  and returned an HTML/404 response instead of the executable.

## [4.50.1] - 2026-07-23

Deep engineering + product-quality audit: ~45 verified fixes across seven
commits. Highlights below; the full detail is in the individual commit
messages (6cb68b4, dc86508, 09b2d2d, ea74cd3, 9a9fe31, ef8a532).

### Fixed — correctness

- **hidePlannedLivestreams no longer hides finished premieres.** The
  scheduled-metadata fallback regex substring-matched "Premiered N hours
  ago" (and channel-name bylines via "live in"), permanently hiding
  published videos for every user of the new on-by-default feature. The
  regex is now future-anchored and pinned by regression tests.
- **Six download-adjacent features were dead since v4.49.x** — their anchor
  queries still targeted `.ytkit-download-btn`, a class the download-UI
  canonicalization stopped creating. Download-health pills, Stream Links,
  Cobalt fallback, History, transcript-search, and the VLC/MPV handoff
  buttons attach again.
- **Comment badge styling was inverted**: premium interaction CSS selected
  camelCase data attributes that dataset flags never create, so
  pinned/hearted/linked highlighting was dead and the `:not()` rules hid
  pinned/linked badges on every comment (module, monolith, and userscript).
- **Video Hider could hide the wrong video**: quick-hide buttons captured
  the video id at creation while YouTube re-binds recycled cards on chip
  clicks. Type filters (Mix/Movie/Playlist/Auto-dubbed) matched against
  titles — "How to mix audio" was hidden by Hide Mixes.
- **Theater Split**: hidden placeholder chat frames kept
  `pointer-events:none` after teardown (next live stream's chat
  unclickable); live/vod expand after a standard→live SPA nav left
  `#secondary` hidden (empty chat pane); chat-disabled live streams now
  fall back to comments; a CSSOM `'0'` vs `'0px'` comparison dead-ended
  late-chat repositioning.
- **Companion (Python)**: cancelling a download during the pre-spawn probe
  window let it run to completion unstoppable; benign PO-token WARNINGs in
  the output tail no longer shadow the real failure cause; BtbN
  `n8.x`-tagged ffmpeg builds are now compared against the 8.1.2 CVE floor;
  a stale bgutil provider routes to the token-exempt chain
  (`tv,web_embedded,android_vr` — bare `web` removed) instead of minting
  rejected tokens; the post-setup GUI freeze from on-thread version probes
  is gone.
- **Audio features**: disable→re-enable summed the dry passthrough with the
  rebuilt processing chain (~+6 dB, broken mono/pan); a suspended
  AudioContext could mute playback entirely with no resume path.
- **Return YouTube Dislike**: disabling the feature during an in-flight
  votes fetch overwrote the persisted 500-entry cache with a single entry.
- **DeArrow**: branding fetches pending across a navigation were never
  cached (every nav bumped the destroy generation), re-fetching the same
  videos against the API budget; lazy thumbnails no longer store an empty
  original-src that broke error/disable restores.
- **SponsorBlock**: the player observer now disarms on zero-segment videos
  (it churned on playback ticks all session) and re-renders segments after
  a player chrome rebuild.
- **Core**: three DOMParser-fallback sanitizer bypasses closed (template
  content, control-character schemes, srcdoc); stale-cache health events
  no longer double-notify with a transient error state; mutation-observer
  scheduling state resets on stop; a failed storage flush's backoff is no
  longer cancelled by queued flush callers; the settings color "Clear"
  button actually persists (dispatched `change` where persistence listens
  on `input`).
- **Sidepanel quick-settings** request runtime-optional host grants inside
  the click gesture — on store-safe builds SponsorBlock/DeArrow toggled
  "enabled" while every fetch was rejected for a missing grant.

### Fixed — UX / accessibility / theming

- Toasts stack above the settings panel (panel-fired Undo affordances were
  invisible behind the modal); scrub and Watch Later cleanup report
  honest results (no more green success on zero native removals, and the
  cleanup uses the locale-independent structural menu match); video-notes
  no longer claims "Saved locally." on a failed write.
- Light-theme ports for video-notes, download-health pills, Stream
  Links/History buttons, persistent queue, and the bulk-actions bar (all
  rendered white-on-white or as dark slabs on light YouTube); WL cleanup
  button gains a light variant.
- Keyboard: playlist quick-remove and queue controls gain focus-visible
  reveals/rings; bulk selection count and popup filter results are polite
  live regions.
- Pill-radius house rule enforced in core and feature modules (settings
  switch track, RYD card bar) with a widened hardening gate.

### Changed

- ROADMAP: token-exempt client chain P1 implemented and removed; 20
  verified-but-unfixed audit findings filed as a prioritized backlog.

## [4.50.0] - 2026-07-23

### Added

- **Hide planned livestreams on the Subscriptions page (on by default).** New
  `hidePlannedLivestreams` feature that hides scheduled livestreams and
  premieres — the entries that only show a "Notify me" (set reminder) button
  and "Scheduled for …" metadata instead of a view count. Detection keys on the
  card's "Notify me" action button (with a scheduled/upcoming metadata fallback
  scoped to the metadata rows and thumbnail badge, never the title, to avoid
  hiding a normal video whose title merely contains a word like "premiere").
  The card is hidden **only while it is not live**: once the stream goes live
  YouTube re-renders the card without the notify button, so a fresh feed scan
  reveals it automatically. Scoped to `/feed/subscriptions`, injected via a
  single `.ytkit-planned-livestream-hidden { display: none }` rule driven by a
  scoped mutation rule plus a navigation rule. Extension-only. Verified against
  a captured Subscriptions DOM: 5/5 planned-livestream cards hidden, 0 false
  positives across 104 normal cards, and confirmed the card reappears when the
  hide class is removed (live transition).

### Security

- **Cleared every dev-toolchain advisory without downgrading `web-ext`.** The
  Firefox build/lint tree pulled vulnerable `adm-zip` (<0.6.0), `shell-quote`
  (<=1.8.4), `brace-expansion`, and `js-yaml` transitively; the only
  `npm audit fix --force` route downgraded `web-ext` to `0.0.1`. Since even the
  newest `web-ext` (10.5.0) still ships the vulnerable `fx-runner`/
  `firefox-profile` deps, the fix pins patched `adm-zip@^0.6.0` and
  `shell-quote@^1.10.0` via `overrides` and bumps `brace-expansion`/`js-yaml`
  in place. `npm audit` now reports 0 vulnerabilities (production and dev),
  `web-ext` stays at 10.4.0, and `check:firefox` lints clean.

### Changed

- **Astra Downloader now uses a quieter four-page desktop system.** Dashboard,
  Downloads, History, and Settings follow the same imagegen-guided graphite
  layout with readable 12–14 px supporting type, a compact rail and headers,
  line icons, semantic state dots, and hairline grouping in place of stacked
  outlined cards and status pills.
- **Operational pages prioritize the next useful action.** Dashboard condenses
  service health into one control band, an inline readiness list, and a metric
  strip; Downloads and History use concise borderless empty states and History
  now exposes its future row columns before data arrives.
- **Companion empty-state glyphs rasterize at native size.** The Downloads and
  History "nothing here yet" icons were drawn on an 18 px grid and upscaled 2×,
  reading slightly soft; `make_line_icon` now accepts a target size and scales
  its geometry and stroke so the 36 px glyph renders crisply.
- **Companion Settings is a dense document form.** Section labels occupy a
  stable left column, helper copy is reduced to one useful line, and controls
  are grouped with separators instead of container boxes.

### Added

- **Downloads fall back to token-exempt YouTube clients when no proof-of-origin provider is running.** YouTube now requires PO tokens for the default `web`/`mweb` clients (SABR-only formats or HTTP 403 without them). When the bgutil PO-token provider probe is not reachable, the companion adds `youtube:player_client=tv,android_vr,web` so extraction degrades gracefully instead of failing outright; when the provider is live, the web client + PO tokens is used unchanged. The dashboard's "PO provider" readiness row now reads **Fallback** (with an explanatory tooltip) instead of "Optional" so the active client path is visible.

### Security

- **The companion flags a known-vulnerable ffmpeg against an exact version floor.** The ffmpeg capability probe compared only the major version (≥7), so a tagged 8.0.x on PATH — inside the RV60 out-of-bounds-read range and below the 8.1.2 MagicYUV-decoder RCE fix (CVE-2026-8461, CVSS 8.8) — passed silently. The probe now enforces an exact `8.1.2` semver floor for tagged builds while leaving the bundled master build (which reports no numeric version and is always newer) unflagged; `/health` surfaces the below-floor state.

### Fixed

- **Pending downloads now read with the same amber state tone as their queue siblings.** A freshly queued `pending` job fell through to the neutral grey dot while its `paused` and `needs-sign-in` siblings (same pending set) and `queued` all showed amber, so the Downloads "Pending" section mixed grey and amber dots for equivalent waiting states. `pending` now maps to the warning tone.
- First-run ffmpeg setup now verifies the downloaded Windows archive against the upstream `checksums.sha256` manifest and its exact asset name; the retired per-archive `.zip.sha256` URL no longer blocks installation.

- **Companion visual smoke captures are reliable on scroll-backed pages.** The
  renderer now composites the tab surface and rail independently, preventing
  Qt's Windows offscreen viewport painting from obscuring page headers or rail
  destinations in Downloads and Settings screenshots.
- **Companion visual smoke no longer aborts on launch.** The rail-composition
  pass referenced `make_line_icon` through the top module, which never
  re-exported it; the offscreen renderer aborted with an unhandled slot
  exception (0xC0000409) and produced no screenshots. The helper is now
  re-exported and a contract test guards the renderer's `app_module` surface.
- **`AstraDownloader.exe --visual-smoke` no longer delegates to a live
  companion.** The throwaway UI-capture launch ran the single-instance guard
  first, so on a machine already running the companion it silently exited
  without rendering and forwarded a launch request to the running instance.
  The smoke path now skips the guard entirely, matching its side-effect-free
  intent.

## [4.49.10] - 2026-07-15

### Fixed

- **Subscription masthead actions now arrive as one stable group.** Removed the
  one-second deferred insertion that painted YouTube's native controls first
  and then shifted them when Astra's actions appeared. The subscription and
  Home action groups now synchronize immediately and whenever YouTube replaces
  its masthead controls, without polling every page mutation.

## [4.49.9] - 2026-07-15

### Fixed

- **Enabled settings toggles move their thumb again.** The v4 visual layer no
  longer lets a physical `left:auto` declaration cancel its logical active
  offset. Thumb motion now follows the inline direction in both LTR and RTL,
  with rendered geometry coverage for active and inactive states.

## [4.49.8] - 2026-07-15

### Changed

- **Settings now use a calmer, compact document layout.** The imagegen-guided
  v4 visual system removes the redundant status inspector, decorative dropdown
  boxes, card-like status chrome, and most full control outlines. Larger type,
  shorter section copy, 70px rows, a 64px header, and a 58px footer move useful
  controls substantially higher in the viewport without sacrificing focus
  visibility.
- **Settings adapt cleanly across every supported layout.** Desktop, light,
  RTL, tablet, and 390px mobile views share the same hierarchy; mobile keeps
  readable wrapping while desktop descriptions stay to one concise line.

### Fixed

- **Scrolled settings headers remain opaque in every submenu.** The compact
  sticky section header retains its solid theme surface and stacking contract,
  preventing controls from overlapping section titles while scrolling.
- **Settings feedback is quieter and clearer.** The idle status is now
  unboxed `Saved` text, the primary completion action reads `Done`, and full
  descriptions remain available through native title text when visually
  truncated.

## [4.49.7] - 2026-07-15

Roadmap drain: both remaining P2 engineering items and every actionable P3
localization/theming item.

### Changed

- **AI summaries moved out of the settings object.** The artifact store (up
  to 1.5 MB) now lives in its own `ytkit-ai-summaries` storage key, so
  settings saves and cross-tab broadcasts stop shipping it to every YouTube
  tab and the library search stops re-sanitizing it per keystroke. Existing
  stores migrate automatically on load; old backups that embedded the store
  inside settings import correctly, and new backups (popup and in-page)
  export it as a first-class data domain.
- **The settings panel's five stacked style layers are folded into one.**
  3,129 lines of superseded `!important` restyle passes were deleted; the v3
  visual system is now the single source of truth (it absorbed the two
  load-bearing declarations the old layers still provided — the mobile nav
  grid reset and the above-player z-index contract).

### Added

- **The side panel / Firefox sidebar is fully localized** (137 new keys in
  all 11 locales) with RTL document handling, matching the popup.
- **The popup's last hardcoded-English flows are localized** — AI credential
  section, credential statuses, import preview, Reset success copy, and
  schema-overview badges/tooltips (32 new keys, hand-translated).
- **The Watch Later Workbench and reaction sender are localized** (~58 call
  sites, 53 new keys); the live-chat module gained a proper i18n dependency.

### Fixed

- **Chat and workbench surfaces follow light YouTube.** The reaction sender
  (both copies), the Watch Later Workbench, and the parent-page live-chat
  shell now use YouTube theme variables instead of hardcoded dark colors,
  and use logical CSS properties so they mirror correctly in RTL locales.
  The premium live-chat iframe interior keeps its deliberate dark look.

### Blocked

- The live-chat popout/tooltip English-only structural fallbacks moved to
  Roadmap_Blocked.md — replacing them safely needs live-DOM verification on
  an actual live stream.

## [4.49.6] - 2026-07-15

Deep-audit backlog drain plus a fresh audit sweep over the companion app,
popup, and build tooling.

### Security

- **Anonymous fetches stay anonymous.** The extension fetch bridge now honors
  a downgrade-only `credentials: 'omit'`, so the video-insights InnerTube
  probe no longer sends YouTube session cookies. Callers can never upgrade a
  non-allowlisted origin to credentialed.
- **The userscript AI credential dialog renders inside a closed shadow root.**
  Page scripts on youtube.com could previously read the password input's
  value (or keylog it) while the dialog was open.

### Fixed

- **Settings imports confirm persistence before reporting success.** A real
  `chrome.storage` write failure now rolls the import back instead of
  returning a success summary while the rollback paths stayed unreachable.
- **YouTube state reset handles the bloated stores it exists for.** Values
  over the 128 KB backup limit (typically `yt.innertube::requests`) are now
  cleared without a snapshot and reported as not undoable instead of failing
  the whole reset with "too large to reset safely".
- **Popup quick toggles tell the truth on fresh installs.** Default-on
  features no longer render as Disabled (with a 0 enabled count) before their
  first explicit write, and the first click disables them instead of
  re-writing `true`. Diagnostic and legacy-migration writes now go through
  the serialized mutation controller, closing a lost-update race.
- **Companion race fixes.** `/update` re-checks in-flight downloads right
  before restarting (and pauses queue intake for the whole window) so the
  self-update can no longer orphan freshly spawned yt-dlp processes; a cancel
  can no longer be revived by a slow-starting worker; retry/resume return 409
  while the failing worker is still finalizing; and the folder picker can no
  longer stack a second native dialog.
- **Gemini honors the `aiSummaryModel` setting** by substituting a validated
  model into the request path instead of silently pinning the default.
- **Clean Share URLs copy interception works now.** The old handler read
  `clipboardData` during dispatch (always empty) and never fired; single-URL
  selection copies are now cleaned via the live selection.
- **Search filtering works beyond English.** Recommendation interleaves are
  detected by YouTube's structural `data-content-type` marker first, and the
  search-while-watching status line is a reorderable `{count}`/`{query}`
  template for RTL/CJK locales.
- **Settings panel mirrors correctly in RTL.** The v3 visual layer's nav
  accent bar, switch thumb, and sub-feature indents use logical inline
  properties; insight-rail visibility keys on stable data attributes instead
  of fragile nth-child positions.
- **Build tooling:** `audit-storage-size --file` no longer crashes before
  printing, and `i18n-coverage --check-report` no longer overwrites the
  report it is checking (a guaranteed-pass gate).

### Changed

- CPU Tamer's description now discloses its hidden-tab lock and database
  force-release behavior, its lock queue replaces the oldest entry instead of
  silently dropping new work, and the extension build no longer installs a
  redundant ISOLATED-world resource-unlock twin.
- Companion HTTP routes use real `DownloadManager` accessors
  (`exists`/`status_of`/`snapshot_of`) instead of reaching into the manager's
  private lock and map.

## [4.49.5] - 2026-07-15

### Fixed

- **DeArrow no longer reports ordinary database misses as rejected requests.**
  The DeArrow API returns HTTP 404 plus an empty branding payload when a video
  has no crowdsourced replacement. Astra Deck now treats and caches that as a
  healthy negative lookup, preserving fallback title formatting and avoiding
  repeated requests. Malformed video IDs are rejected locally.
- **Full Settings can safely enable store-safe API features.** Enabling DeArrow,
  SponsorBlock, or another runtime-host feature from the in-page panel now
  requests only the host patterns declared by the active build before saving
  the setting. Denied grants restore the toggle and provide recovery guidance;
  permission failures are identified separately from upstream HTTP errors.
- **Sticky-header coverage now spans every Settings category.** Both modular
  and fallback headless smoke lanes scroll and validate all ten category
  headers in dark and light themes, preventing a submenu-specific regression.

## [4.49.4] - 2026-07-15

### Fixed

- **Settings section headers remain readable while scrolling.** The active category header now owns an opaque, theme-aware sticky surface and explicit stacking context, preventing feature names, descriptions, and toggles from showing through the Playback/section title in dark or light mode. The headless settings smoke now scrolls the real panel and captures this state in both extension-module and userscript-fallback paths.

## [4.49.3] - 2026-07-15

### Fixed

- **Split Theater comment scrolling no longer degrades video playback over long sessions.** Auto-expand and pinned-comment handling now process only newly inserted comment subtrees instead of repeatedly rescanning the growing comments DOM; unchanged `hidden` writes can no longer feed back into the shared mutation observer. The split pane leaves in-panel wheel and touch gestures on the native scroller, contains overscroll, skips rendering offscreen comment threads, and uses a stable lifecycle class instead of hundreds of inline-style substring selectors. The standalone Theater Split userscript carries the same rendering and selector safeguards.

## [4.49.2] - 2026-07-15

Deep audit pass over the 2026-07-14/15 feature wave and companion refactor.

### Fixed

- **Companion folder picker worked again.** Every `/pick-folder` request
  returned HTTP 500: the nested `/queue` route handler was named `queue`,
  shadowing the stdlib `queue` module for every sibling closure in
  `create_api`. The extension popup's "Change folder" button was fully broken;
  a Flask-level round-trip test now pins the path.
- **Companion queue recovery is truthful.** A schema-incompatible pending
  queue now surfaces its real cause (with a distinct `queue-schema-incompatible`
  code and remediation) instead of generic disk-space advice; cookie-jar write
  failures regained their server-log diagnostics.
- **Cross-browser wrapper drift.** Successful `downloads.show` reveals were
  logged as `reveal-failed` in the service-worker lifecycle ring (the void
  no-callback API rejected in the retry path); popup preview mode crashed on
  its own degraded-path classifier; the What's New dismissal raced popup
  teardown so the banner could reappear forever; a slow-hydrating watch page
  could get a duplicate youtube.com tab from the panel-open ack timeout; and
  Firefox native-messaging disconnects lost their reason (`port.error`).
- **Feed features under mutation pressure.** Subscription View no longer
  self-triggers a ~10 Hz mutation loop, no longer sorts cards past the
  infinite-scroll continuation renderer (which pinned a permanently
  intersecting spinner at the top of the feed), skips off-page teardown churn,
  and keeps keyboard focus when switching Grid/List/Compact. Video Hider
  requeues the unprocessed tail of a cancelled mutation batch instead of
  leaving hidden videos visible. Search While Watching invalidates in-flight
  searches on cache hits, stops caching empty result sets, and offers retry in
  the empty state. Video Insights sweeps its attempt map and retries panel
  attachment on slow cold loads.
- **Live chat and floating chat.** Dragging the fullscreen floating chat no
  longer strands when the cursor enters the chat iframe (pointer capture +
  drag-state reset); the iframe reaction controller no longer wipes the
  top-frame panel's saved position; reaction discovery and Watch Later
  Workbench removal no longer depend on English YouTube strings (removal was
  a silent no-op on the 10 non-English locales); the default bot filter no
  longer hides users merely containing "bot" (Abbott, Botany); message entry
  animation respects reduced motion.
- **Data safety.** The YouTube state-reset undo snapshot survives
  transport-level failures (the channel can die after state was already
  cleared — deleting the snapshot destroyed the only recovery); overlapping
  storage flushes are serialized so a failed older write cannot resurrect
  stale values over newer persisted ones; AI summary artifact saves surface
  async persistence failures; Return YouTube Dislike session caches are
  evicted with card pruning; Clean Share URLs re-cleans in-place share-input
  updates.

### Accessibility

- **Settings toggles regained a visible keyboard focus ring** — the v3 visual
  system's box-shadow reset had silenced every focus cue on the panel's
  primary control in both themes.
- **AA contrast repaired**: filled coral controls (Save) moved from 3.08:1 to
  4.99:1 via a dedicated accent-fill token; light-theme subtle text raised
  from 3.36:1 to 4.6:1; the Subscription View active button is readable in
  the light theme. The Watch Later Workbench dialog gained Escape-to-close,
  initial focus, a live status region, and focus-visible rings.

### Localization

- The 10 YouTube state-reset status/toast strings and the artifact
  save-failure toast referenced locale keys that were never registered;
  keys now exist in all 11 locales with `{count}` templates for dynamic
  values.

## [4.49.1] - 2026-07-15

### Changed

- **Astra Downloader advances to v1.5.2.** The companion version shown in its
  dashboard, health API, Windows registration, update probes, and packaged
  metadata now identifies this hardened maintenance release.
- **Secondary download and transcript surfaces now share the full theme system.**
  The download chooser uses larger, calmer controls and clearer muted text,
  while both it and the transcript panel now have dedicated light-theme
  surfaces, borders, status colors, hover states, and focus rings. The isolated
  accessibility smoke retains dark/light screenshots for all rendered surfaces
  so visual regressions are reviewable after every run.
- **Settings now use a calmer, readable visual system.** The extension and
  userscript share an imagegen-led settings layout with larger type, continuous
  divided rows instead of boxed cards, quieter category and status chrome,
  simplified footer actions, consistent toggle geometry, and responsive
  dark/light/RTL/mobile treatment. The compact brand lockup now keeps the logo,
  product name, and Settings label aligned at intermediate window widths. The
  rendered smoke captures every settings category in both desktop themes plus
  a dedicated tablet-width state so secondary screens stay reviewed.

### Security

- **Helper installation now bounds every trust boundary.** Checksum and
  companion-version manifests stream under explicit size ceilings; verified
  Deno and FFmpeg archives must contain exactly one executable with the
  expected basename, and extraction is atomic with a hard expanded-size cap.
  First-run yt-dlp updates now use the staged health-check and rollback path
  instead of mutating the live binary directly.
- **Sensitive companion tokens now expire from the clipboard.** Copying the
  private local API token schedules a 60-second clear that only runs when the
  clipboard still contains that token, so newer clipboard content is never
  overwritten.
- **Companion API responses now minimize private local state.** Authenticated
  configuration requests expose only the download paths and supported format
  choices the extension consumes, while health and Deno provisioning omit local
  executable paths. Preflight responses now advertise every supported auth
  header, and indeterminate folder paths are no longer presented as trusted.
- **Uninstall no longer terminates unrelated media processes.** Removal first
  asks the running companion to close and cancel its own jobs, then limits the
  fallback process-tree cleanup to `AstraDownloader.exe`; unrelated yt-dlp and
  FFmpeg work owned by other applications is left untouched.
- **Companion diagnostics are redacted and reviewable before sharing.** The
  dashboard now builds a bounded, allowlisted JSON payload, removes local
  paths, URLs, tokens, cookie-shaped values, and opaque identifiers, and opens
  the exact payload in a review dialog before anything reaches the clipboard.
- **In-page locale overrides are constrained to bundled translations.** The
  content script now rejects malformed, stale, or manually restored locale
  values before constructing an extension resource URL, matching the popup's
  allowlist boundary.
- **Dependency gates now cover vulnerable floors and build tooling.** Requests
  now starts at 2.33.0 and Waitress at 3.0.2. The Python audit resolves both the
  declared ranges and their exact direct minima, while the default npm audit
  checks the production graph and the complete development/tooling graph.
- **Predicate-sandbox ReDoS gap closed.** The regex safety screen for
  user-authored filter predicates rejected nested catastrophic forms but let
  *sequential quantified groups* through — `(a+)(a+)(a+)(a+)(a+)b` and
  `(.*)(.*)(.*)(.*)(.*)x` passed as "safe" yet backtrack in O(n^k), freezing the
  tab for tens of seconds on an ordinary title. Open-ended quantifiers are now
  counted across the whole pattern (regardless of grouping) with the same
  4-quantifier ceiling, so these are rejected at compile time. Patterns with up
  to four quantifiers (real-world URL/title filters) still compile.
- **Trusted-HTML DOMParser fallback now sanitizes.** On engines without the
  Sanitizer API (`Element.setHTML`) — most stable browsers today — the fallback
  parsed via `text/html` but did not strip `on*` event-handler attributes or
  `javascript:`/`data:`/`vbscript:` URLs. Every current caller passes static SVG
  literals, but the sink is now hardened so a future untrusted caller cannot
  smuggle an XSS payload past the parse.
- **Companion `/health` no longer leaks diagnostics to unauthenticated callers.**
  `recentErrors` (which can carry absolute paths, usernames, and exception text)
  is now gated behind the bearer token; an unauthenticated local caller receives
  an empty list.

### Fixed

- **Maintenance fails closed when local state is uncertain.** Automatic yt-dlp
  replacement defers when the active-download probe fails, while oversized
  local JSON state is quarantined before parsing so corrupted history or update
  metadata cannot exhaust startup memory.
- **Companion maintenance and validation states now recover cleanly.** Manual
  yt-dlp updates defer while downloads are active, marshal completion back to
  Qt's UI thread, restore the busy button on every outcome, and explain
  rollback results. Invalid settings expose accessible field descriptions and
  move focus to the first problem instead of showing only a generic footer.
- **Extension fetch requests now fail before allocating network work.** The
  service worker rejects unsupported HTTP methods instead of silently issuing
  a GET, caps serialized request bodies at 2 MiB, and reports serialization
  errors before creating a timeout or abort controller.
- **Downloader recovery and malformed-input paths now fail safely.** Durable
  queue restores re-check YouTube URLs and configured output roots, retain an
  explicitly paused empty queue across restarts, and reject fractional reorder
  positions. Non-object API bodies and malformed history limits return clear
  400 responses, while non-finite browser-cookie expiries degrade to session
  cookies instead of stranding a queued download before its worker starts.
- **The settings version no longer has a dismiss-only notification badge.**
  The footer version is passive text in the extension, fallback, and userscript;
  the separate popup release-notes surface is unchanged.
- **Toolbar popup smoke now handles Chromium's headless action gap.** When a
  headless browser omits `chrome.action.openPopup`, the smoke retries the same
  staged extension once in headed mode and still requires real toolbar
  activation; it never bypasses the action with direct popup navigation.
- **ffmpeg maintenance no longer deletes the working binary before refresh.**
  The companion downloads, verifies, and extracts a replacement beside the
  current executable, atomically swaps it only after validation, preserves the
  old copy on failure, defers refresh while downloads are active, and respects
  the user's automatic yt-dlp update preference during setup and repair.
- **Deno readiness now fails closed when the runtime cannot identify itself.**
  A present but broken or unparsable Deno executable is reported as unsupported
  with a repair action instead of being allowed through to an opaque yt-dlp
  format failure; provisioning also replaces unverifiable bundled runtimes.
- **Extension fetch bodies now fail closed instead of corrupting binary data.**
  The content bridge rejects ArrayBuffer, typed-array, Blob, and FormData bodies
  before Chrome's JSON-only runtime messaging can erase their contents, while
  URLSearchParams is normalized to a stable string and the background repeats
  the guard for non-Chrome callers.
- **RTL settings search controls no longer overlap.** The command search now
  mirrors its leading icon, trailing result/actions area, and input padding as
  a unit, with rendered desktop-RTL geometry coverage.
- **Reopening Astra Downloader no longer terminates the running service.** A
  second launch now asks the existing instance to show its window (or start the
  server for protocol launches) and exits cleanly, preserving active yt-dlp and
  FFmpeg jobs; mutex failures also fail safely instead of falling into a broad
  `taskkill` takeover path.
- **Comment input underlines no longer leak through restyled comment surfaces.**
  Studio Comments and the Nyan comment cleanup now hide YouTube's current
  `tp-yt-paper-input-container` underline node in both extension and userscript.
- **Firefox smoke now discovers non-stable Windows channels.** The default
  executable search includes Firefox Developer Edition and Nightly in both
  Program Files roots, so local AMO verification no longer needs `--firefox`
  on those installations.
- **Navigation effects no longer cross-fade infinite-scroll updates.** The
  document View Transition now runs only when the URL changes, is skipped for
  reduced-motion users, and falls back safely if the cosmetic API rejects while
  functional navigation rules continue.
- **Comment Handle Revealer no longer wedges on slow pages or early startup.**
  Author-page requests now time out after eight seconds, release their dedupe
  entry for a later retry, attach when YouTube renders `#page-manager` late,
  and abort every in-flight request on teardown in both extension and userscript.
- **Deferred comment-selection styles now stay off the first-paint path.** The
  shared observer's registration callback carries no added nodes; that bootstrap
  call is now ignored so the stylesheet loads at idle or when comments actually
  appear, as intended.

- **Companion empty states now lead somewhere useful.** Empty Downloads and
  History pages provide direct navigation to the dashboard or queue, History
  disables Clear when there is nothing to remove, and disabled primary,
  secondary, ghost, and destructive buttons now look visibly unavailable.
- **Lazy settings styles now load on the normal module path.** The optimized
  first-open stylesheet trigger only existed in the monolith fallback, so the
  production settings-panel module could render the dialog centered at the
  document origin and clip half the workspace. Both paths now ensure styles
  before building, with retry-safe injection and dark/light/RTL/mobile smoke
  coverage.
- **Companion downloads now close their subprocess pipes deterministically.**
  Completed, failed, cancelled, and cookie-less retry paths explicitly close
  the `yt-dlp` stdout stream instead of leaving Windows handles for garbage
  collection. The YouTube-host allowlist test is also hermetic and no longer
  launches real download workers during the unit suite.
- **Companion queue no longer locks permanently after 200 lifetime jobs.**
  Queue admission now reclaims the oldest completed, failed, or cancelled
  records only when capacity is needed, while preserving every active job and
  the existing 200-record bound.
- **Companion settings and history writes now fail truthfully.** Config updates
  publish to memory only after the atomic file replacement succeeds and roll
  back on disk errors. Settings remain dirty without restarting the server, and
  History Clear/Undo preserve their file and recovery snapshot instead of
  displaying false success.
- **Popup could clobber a concurrent sidepanel settings write.** `writeSetting`
  merged the toggled key onto the in-memory cache; with both surfaces open a
  stale cache could overwrite the sidepanel's write to a different key. It now
  re-reads live storage inside the serialized `_pendingWriteChain` (which
  already prevents the within-popup race), matching the sidepanel.
- **Companion download queue could exceed its hard cap.** The `MAX_QUEUED_TOTAL`
  check released the lock during URL/output normalization, so concurrent
  `/download` requests could all pass and push the queue past 200. The cap is
  now re-checked under the lock immediately before insertion.
- **Companion stall watchdog could spawn a duplicate on the live-stream retry.**
  The watchdog closures resolved the stop-event and process by name; the
  "live event has ended → retry without cookies" path rebound both, so a
  lingering original watchdog could poll the retry's process and cross-kill it.
  Each watchdog is now bound to its own event/process, and the original is
  joined before the retry starts.
- **Sidepanel toggle showed a false "save failed" when only the tab broadcast
  errored.** The setting was persisted, but a failure to notify open YouTube
  tabs returned `false` and snapped the toggle back. Persistence now determines
  success; the tab broadcast is best-effort (content scripts still pick up the
  change via `storage.onChanged`).
- **Popup search "clear" affordance stayed visible after Escape/clear.** The
  Escape-to-clear and clear-button paths re-rendered results but never refreshed
  the clear-button visibility; both now call `updateSearchState()`.
- **Popup JSON schema editor double-persisted on edit.** `change` and `blur`
  both fired the writer with no equality guard, issuing two identical storage
  writes + tab broadcasts + re-renders per edit. An unchanged-value check (like
  the number editor's) now short-circuits.
- **`capabilityProbe.probe()` mis-reported async capabilities.** For async
  probes it returned a raw promise, which is always truthy — `if (probe('mediaDL'))`
  read `true` unconditionally. It now uniformly resolves a real boolean.
- **Service-worker reveal hydration could stall on storage pressure.** The
  pending-reveals `storage.session.get` had no timeout; every awaiter (reveal
  handlers, the serialized SW-lifecycle chain) is now bounded by a 2s race that
  falls back to the in-memory set.
- **Return YouTube Dislike left a zombie render timer on teardown.** The
  navigate rule armed a 1.5s `setTimeout(_render)` that was never cancelled, so
  disabling the feature right after a navigation re-injected a stray pill ~1.5s
  later. The timer is now tracked and cleared in `destroy()` (both the peeled
  module and the monolith copy).
- **Return YouTube Dislike could show the wrong video's dislike count.**
  `_render` didn't re-check the active video after the RYD fetch await, so a
  navigation mid-fetch appended the previous video's count. It now bails if the
  video changed, matching the DeArrow/SponsorBlock route guards.
- **CSS lifecycle `apply()` could never inject a style that started at its
  default.** `init()` skips creating a record when the initial CSS is falsy, and
  `apply()` bailed with no record — so a color/accent spec left at its default
  value would never render once the user picked a non-default. `apply()` now
  injects when `buildCss` first returns truthy CSS.
- **SponsorBlock anti-adblock diagnostic logged `[object Object]`.**
  `DiagnosticLog.record` stringifies its message; the anti-adblock detection
  passed an object, losing the selector detail the diagnostic exists to capture.
  It now records a formatted string.
- **Chapter-markdown copy could emit `?t=NaN`.** The timestamp reduce lacked the
  NaN/undefined guard its sibling function has; `parseInt` is now radix-pinned
  with `|| 0` fallbacks.

### Performance

- **Disable Frosted Glass no longer installs a universal CSS selector.** Both
  extension and userscript now target YouTube's masthead, chip, menu, dialog,
  popup, and player-chrome surfaces instead of rematching every DOM element on
  each feed mutation.

## [4.49.0] - 2026-07-11

- **Wave 11 — external-userscript feature ingestion (all off by default).** A
  first wave of features added after a competitive userscript review, chosen for
  being conflict-free and stable:
  - **Hide Guide Elements.** A granular left-navigation (Guide) hider that
    mirrors the Hide Chat Elements manager: a master toggle plus per-item
    checkboxes for Home, Subscriptions, History, Playlists, Your Videos, Watch
    Later, Liked Videos, Trending, Music, Movies & TV, Live, Gaming, News,
    Sports, Learning, YouTube Premium, YouTube Studio, Settings, Report History,
    Help, and the Guide footer. Row matching is `:has()`-based and href-anchored
    where stable so it survives locale changes. It auto-disables (and is
    auto-disabled by) **Hide Sidebar**, since hiding the whole rail makes
    per-item hiding moot.
  - **Stable CSS toggles:** Hide Own Avatar, Hide Search Sidebar, Hide Scrubber
    Handle, Soften Bottom Gradient, Hide Comment Composer, Hide Comment Reply
    Button.
  - **UI Font Size.** Optional base interface font-size override (0 = YouTube
    default, otherwise clamped 8–20px).
  - Schema grows 399 → 408 keys; feature copy is seeded across all 11 locales.

## [4.48.2] - 2026-07-10

- **Blue-light control clarity.** Blue Light Filter remains disabled on clean
  installs and now appears in the main settings overlay as an explicit master
  switch. Its 10-80% intensity slider is nested beneath that switch and stays
  non-interactive until the warm tint is enabled. Extension and userscript
  surfaces share the same hierarchy, with rendered module/fallback smoke
  coverage pinning the off-by-default state.

## [4.48.1] - 2026-07-09

- **Companion interaction finish.** The native companion now uses checkable,
  mutually-exclusive navigation with distinct keyboard focus, announces its
  page stack to assistive technology, surfaces unsaved settings immediately,
  and gives empty Downloads and History views an actionable starting point.
  Its offscreen visual smoke now rebuilds every page in a fresh window,
  verifies the active destination and full rail, and works around Qt viewport
  compositing so the four captured views are reliable review evidence.

- **Compact surface hierarchy.** The diagnostics side panel now hides routine
  safe/global/both metadata, removes duplicate Open YouTube calls to action,
  reserves stable skeletons while refreshing, balances External API Health
  across the wide grid, and no longer exposes mutually-exclusive profile flags
  as independent switches. The popup puts advanced filter grammar behind a
  disclosure, uses a calm search placeholder, removes hover affordance from
  read-only stats, and keeps the Bookmarks label readable at 420 px.

- **Settings command center v2 parity.** A second image-generated target now
  drives the in-page workspace: the desktop header uses a horizontal brand
  lockup and live-connection badge, the shell has a quieter frame and wider
  System Pulse rail, Recent Activity records export/import actions, and mobile
  category navigation no longer collapses to icon width. Module and monolith
  fallback now share the same header search, health rail, sidebar tools, and
  footer actions. Category tabs expose selected/tabpanel semantics with arrow
  navigation, disabled child settings are removed from keyboard interaction,
  and the rendered smoke rebuilds dark/light/RTL/mobile states while enforcing
  those parity and accessibility contracts.

## [4.48.0] - 2026-07-09

- **Contextual caption triggers.** Two new subtitle toggles: Subtitles While
  Muted turns captions on while the video is muted and restores the previous
  caption state on unmute; Subtitles on Rewind flashes captions for 10 seconds
  after a backwards seek so the missed line is readable. Both only ever undo
  caption state they set themselves.
- **Live Catch-Up Speed Reset.** When a live stream watched above 1x reaches
  the live edge, playback resets to 1x (with a toast); seeking back more than
  15 seconds behind the edge restores your previous speed.
- **Watch Later Workbench.** New bulk-management panel on the Watch Later
  playlist: filter loaded rows by watched %, channel, or title with a live
  preview (sortable by duration or title), export the scan as CSV/JSON, and
  remove matches through the native row menus in bounded sessions (25 per
  run, 400ms pacing). Every removal is appended to a capped local recovery
  log that exports as JSON. The status line discloses that only loaded rows
  are covered — scroll the playlist to extend coverage.
- **Scroll in Fullscreen.** New toggle that restores the removed native
  fullscreen-scroll layout: scroll down while fullscreen to read the
  description, comments, and related videos, scroll back up to return to the
  video. CSS-only, gated on the fullscreen attributes, verified against the
  live 2026-07 watch-page DOM.
- **Shorts Speed Control + Auto-Advance.** Two independent Shorts toggles:
  a click-to-cycle speed chip (0.5x-2x, seeded from Persistent Speed when
  enabled, re-applied per reel) and an auto-advance mode that stops Shorts
  from looping and scrolls to the next Short when one finishes. Together with
  the existing Shorts Player Controls (native seekbar/scrubbing) and Remember
  Volume (already applies on Shorts) this completes in-Shorts player control.
- **Persistent Queue.** Local play queue that survives tab close and browser
  restart. A hover button on every thumbnail adds videos; a floating
  `Queue · n` control opens a panel with reorder, remove, play-next, clear,
  and JSON export/import (dedup + id validation). Auto-advance plays the next
  entry when the current video ends (sub-toggle), and Auto-Exit Fullscreen
  treats a pending queue entry as up-next so fullscreen is preserved. Capped
  at 200 entries, all data local.
- **Playback Error Auto-Recovery.** New reliability toggle: when YouTube's
  player error screen appears, Astra reloads the page and restores the last
  known position and playback speed. Capped at 3 attempts per video with
  diagnostic log entries; the retry budget resets after 10 seconds of stable
  playback. Recovery state lives in per-tab sessionStorage and expires in 60s.
- **Auto-Exit Fullscreen at End.** New playback toggle that leaves fullscreen
  when a video finishes. Playlist-aware: when the playlist panel has a next
  entry queued, fullscreen is kept so continuous playback is not interrupted.
- **Remaining Time Display v2.** Two new sub-toggles: Compact Remaining Time
  renders the readout as minutes (`-1h24m` / `-23m` / `-45s`) instead of full
  `h:mm:ss`, and Hide in Fullscreen suppresses the readout while the player is
  fullscreen (re-shown on exit via a `fullscreenchange` rebind). The remaining
  math was already playback-speed- and SponsorBlock-aware.

## [4.47.1] - 2026-07-09

- **Style: premium extension command surfaces.** The toolbar popup and
  Chrome/Firefox diagnostics sidebars now share a single graphite/ember design
  token layer, stricter radius scale, stronger focus treatment, and quieter
  elevation. The popup uses one reliable scroll owner, collapses recovery and
  update tools under an accessible Maintenance disclosure, exposes truthful
  tab-context tones, and keeps compact data actions available at narrow widths.
  The diagnostics dashboard removes its nested settings scroller, adds explicit
  refresh/loading/saving/error states, preserves two-line setting names, and
  becomes a two-column command grid when the panel is wide enough.
- **Style: settings command center parity.** The in-page settings workspace now
  targets its real feature-grid and switch markup, uses tone-specific saved /
  warning / error feedback, restores readable light-mode inspector/footer
  colors, bounds the mobile navigation rail and keeps footer actions in a
  compact two-column layout. The rendered smoke now covers mobile light mode,
  explicit RTL direction, mobile occlusion limits, and a fallback-only runtime;
  the fallback also restores keyboard focus and a working Takeout-import Undo.
- **Style: premium companion command center.** Astra Downloader now uses the
  same graphite, coral, amber, and teal system as the extension, with a branded
  navigation rail, denser dashboard hierarchy, sharper control states, and a
  right-side System Pulse for local API, yt-dlp, FFmpeg, Deno, PO-provider, and
  SABR readiness. Toolchain probes run off the GUI thread, classified download
  failures surface recovery guidance inside their activity card, and
  `npm run smoke:companion-gui` renders all four native views offscreen for
  deterministic visual review.

## [4.47.0] - 2026-07-09

- **Feat: cross-browser extension API wrapper.** `core/browser-api.js`
  resolves the standards-track `browser.*` namespace (Firefox today,
  Chrome 148+) with a `chrome.*` fallback and exposes
  `globalThis.YTKitBrowser` plus a scope-injectable factory. It loads
  before every other ISOLATED-world script and on the popup, side panel,
  and sidebar pages. sidepanel.js is the first fully migrated batch —
  zero direct `chrome.*` API calls remain there; popup.js and
  background.js follow in later bounded batches (tracked on the
  roadmap).
- **Feat: rendered visual smoke for the in-page settings overlay.**
  `npm run smoke:settings-overlay` stages the real ISOLATED-world script
  stack onto a local fixture page with a chrome-API stub, opens the
  overlay through the real `YTKIT_OPEN_PANEL` message path in a headless
  Chromium, captures desktop/narrow screenshots for dark, light, and RTL
  states, and fails on blank render, horizontal overflow, a missing
  close/focus target, or primary-control contrast under 4.5:1. First run
  found the settingsOverlay selector pack's stable set missing the live
  overlay root `#ytkit-settings-panel` — now fixed and pinned.
- **Feat: recoverable recommendation scrub sessions.** Bulk Card Actions
  select-mode gains "Not interested" and "Don't recommend channel"
  actions that apply YouTube's own feedback menu item to up to 25
  selected cards per run (paced at 400 ms per card so a session never
  looks like burst automation), hide the cards locally with a one-click
  Undo that honestly notes native feedback stays applied, and record
  each session in a capped local log exportable as JSON — nothing
  leaves the device. Select-mode now also works on the watch page's
  related rail.
- **Feat: subscription health center.** The subscriptions toolbar gains a
  Health button (with staged-count badge) that opens one coherent panel:
  overview stats, stale-channel candidates with per-row Stage/Undo, staged
  unsubscribe recovery with per-row and bulk undo plus the 30-day undo
  deadline, new-since-last-visit summary with Open Digest / Mark all read,
  and JSON/CSV/OPML export actions. Every section has an explanatory empty
  state, the panel renders an error state instead of blanking, and staging
  remains review-only — no YouTube unsubscribe controls are ever clicked.
  Shipped in both the peeled module and the ytkit.js fallback copy.
- **Chore: lint ratchet + build-tool hardening.** ESLint upgraded to
  10.6 with `no-constant-binary-expression` (relational checks) enabled
  across all shipped extension JS — zero violations found.
  `sync-userscript.js` now refuses to bundle a module whose source
  contains a v5.0.0 bundle marker (which would corrupt the next sync
  run's regex region), and the `check-no-eval` scanner keeps template
  `${}` expression code visible while still stripping literal text, so
  eval-shaped code inside template expressions cannot hide from the
  comment-suppression pass.
- **Feat: in-page degraded-state pills for SponsorBlock, DeArrow, and
  Return YouTube Dislike.** The external-API health tracker now supports
  subscriptions and produces compact degradation copy (retry reason,
  request-budget reset, cache age). While a service is rate-limited,
  serving stale cache, or erroring — and the owning feature is enabled —
  a small bottom-left pill explains the state, then disappears on the
  next successful request (or after a 90-second quiet window). Pills are
  a polite ARIA live region, carry a light-theme override, and respect
  reduced motion.
- **Perf: watch time tracker persists once per minute.** The 10-second
  tick now accumulates in memory and writes to `chrome.storage.local` at
  most once per minute, flushing immediately on pause, teardown, and
  pagehide — the old cadence burned 6 of the shared ~120 writes/min
  budget on stats alone.
- **Perf: Reaction Spammer observer throttled.** The full-document
  MutationObserver now collapses each mutation burst into at most one
  restore/render pass per 250 ms window instead of running
  `querySelectorAll` synchronously on every live-chat mutation.
- **Perf: video hider retains fewer detached cards.** Removed-card undo
  records now cap at 200 (was 500) and hold the reinsertion anchor via
  `WeakRef`, so a later-detached sibling subtree can be garbage collected
  instead of being pinned as an ordering anchor.
- **Fix: install docs no longer hardcode stale latest-release claims.**
  README and the native-messaging bootstrap doc claimed "latest release
  v4.46.4 includes the EXE" while GitHub latest was v4.46.34 with no
  companion assets at all. The copy is now tag-agnostic (points at the live
  release page), and `check-versions.js` fails any active install doc that
  reintroduces a hardcoded "latest release vX.Y.Z" claim.
- **Fix: SemVer product-tag sanity gate.** `check-versions.js` (and with it
  `npm run check`), release readiness, and `release:verify-digests` now
  reject product-shaped git tags that version-sort ahead of the current
  package version, printing the offending tag with a delete remediation.
  The stray `v25.11` tag (no release attached) that outranked every
  `v4.46.x` tag in `git tag --sort=-version:refname` was deleted locally
  and on the remote.
- **Security: release readiness blocks validation-signed public CRX
  artifacts.** Every build now writes `build/crx-signing-provenance.json`
  recording whether CRX assets were signed with the external maintainer key
  or an ephemeral validation key. The release manifest folds that in as
  `crxSigningMode`, and `release:readiness --require-pass` fails
  ephemeral-signed builds unless the manifest was explicitly labeled with
  `--validation-build` / `ASTRA_VALIDATION_RELEASE=1` — a throwaway CRX key
  means a throwaway extension ID, so a validation-signed public upload would
  strand every existing install off the update path.

## [4.46.35] - 2026-07-09

- **Security: harden sidepanel/sidebar inline CSP.** Both extension
  side surfaces now match popup.html's strict `default-src 'none'`
  belt-and-suspenders CSP, closing a gap where the manifest CSP was
  the sole defense in detached or tear-off window contexts.
- **Security: close EXT_FETCH proxy port-matching bypass.** The
  `isUrlAllowed` check now requires portless allowlist entries (HTTPS
  default-port origins like SponsorBlock, DeArrow) to match only the
  default port, preventing non-standard-port requests from bypassing
  the fetch allowlist.
- **Fix: forward Gemini API key through EXT_FETCH proxy.** Added
  `generativelanguage.googleapis.com` to `AUTH_HEADER_ALLOWED_ORIGINS`
  so the `x-goog-api-key` header is no longer stripped on Gemini API
  requests, unblocking BYO-key Gemini AI summary.
- **Fix: clear fetch timeout on response body read error.** The
  background.js `readErr` catch path now clears the abort timer,
  matching every other terminal path and preventing the service worker
  from staying alive for up to 60 seconds after a read failure.
- **Fix: sidepanel dashboard on YouTube Music tabs.** Widened
  `isSupportedUrl` to match the same YouTube domain set as the popup
  (music.youtube.com, youtube-nocookie.com, youtu.be), so the
  dashboard no longer shows "Local only" for tabs the content script
  is actively running on.
- **Fix: Reaction Spammer 500 ms safety floor enforced everywhere.**
  The UI input handler and tick scheduler now both clamp to the
  documented 500 ms `_INTERVAL_MIN_MS_FLOOR` instead of allowing
  50 ms via the panel input, preventing intervals fast enough to
  trigger YouTube's automated-behavior detection.
- **Fix: Settings profile import strips internal/secret keys.** The
  `importJson` path now filters imported profiles against
  `getProfileInternalKeys()` and `getProfileSecretKeys()`, matching
  the export sanitizer and preventing crafted imports from overwriting
  `_profiles`, `_settingsVersion`, or `aiSummaryApiKey`.
- **Perf: debounce Return YouTube Dislike cache storage writes.** The
  RYD module now coalesces cache writes with a 2-second debounce timer
  instead of writing the full 500-entry cache on every API response,
  and flushes on feature teardown.
- **Perf: batch subscription sort DOM reflow.** `_applySort` now uses
  `DocumentFragment` to batch card re-appends, eliminating per-card
  layout reflows on the subscriptions feed.
- **Perf: O(n) undo-all for video hider.** `_undoHideAll` now uses a
  Set-based filter pass instead of per-video `indexOf` + `splice`,
  reducing algorithmic complexity from O(n²) to O(n) for large hidden
  lists.
- **Fix: build system validates version regex before writing files.**
  The `--bump` flag now checks the `YTKIT_VERSION` regex in ytkit.js
  before writing any version files, preventing a half-bumped state
  where manifest.json is updated but ytkit.js is left at the old
  version.
- **Security: build zip uses execFileSync on Unix.** Replaced the
  `execSync` shell-interpolated zip command with `execFileSync` and an
  args array, matching the Windows path and closing a theoretical
  shell-injection vector through crafted manifest versions.
- **Fix: Python companion ffmpeg cache thread safety.** Added
  `_FFMPEG_CAPABILITIES_LOCK` to guard `check_ffmpeg_capabilities()`
  and `reset_ffmpeg_capabilities_cache()`, matching the locking pattern
  of the PO-token, Deno, and version caches.
- **Fix: check-no-eval walk skips symlinks.** The eval scanner now
  uses `lstatSync` and skips symbolic links, preventing scan of
  unintended targets outside the repo tree.

## [4.46.34] - 2026-07-09

- **Polish: extension settings executive command deck.** Re-imagined the
  in-page extension settings overlay from a fresh imagegen mockup and pushed
  the extension implementation toward that design: red hairline modal shell,
  top command search, compact left navigation rail, denser premium setting
  rows, right-side operational status/profile/health inspector, and a persistent
  bottom saved/action bar with Export, Import, Reset, and Close.

## [4.46.33] - 2026-07-09

- **Fix: optional-host smoke timeout hardening.** The Chromium optional-host
  release smoke now bounds stalled DevTools HTTP requests, so a wedged
  browser endpoint fails fast instead of hanging local release verification.

## [4.46.32] - 2026-07-09

- **Fix: companion recent-download retention.** Astra Downloader now stamps
  terminal time on completed, failed, and cancelled downloads, so long-running
  items stay visible in Recent Activity for the intended five-minute window
  after they finish instead of being pruned by their start time.
- **Fix: README language inventory drift.** The language table now includes
  the shipped Arabic locale and an i18n regression test checks the README
  count/table against the live `extension/_locales` directories.
- **Fix: extension settings Takeout import recovery.** The modular extension
  settings overlay now matches the extension fallback for large YouTube Takeout
  imports: 500 MB cap, pre-import watch-time snapshot, immediate panel refresh,
  and an Undo action that restores the prior local watch-time store.
- **Security: companion `/health` token bootstrap hardening.** Astra Downloader
  now defaults legacy `/health` token echo off, reflects CORS only for configured
  legacy extension origins, and preserves native-messaging token callers without
  leaking bearer tokens to arbitrary installed extensions.
- **Fix: companion postprocessor failure status.** Non-zero `yt-dlp` exits now
  fail even after 99-100% progress, so late ffmpeg/postprocessor errors no
  longer create false-success history entries.
- **Security: extension artifact staging hardening.** Chrome/Firefox packaging
  and smoke-test staging now share one secret-deny and symlink-safe copier, so
  `.env`, key stores, token files, SSH keys, and symlink/reparse targets cannot
  leak into built extension artifacts.
- **Security: release readiness rejects unexpected assets.** Release manifest
  generation and readiness checks now treat the artifact list as a closed set,
  so debug ZIPs or other auxiliary build files cannot be blessed just by adding
  them to `release-manifest.json` and `SHA256SUMS`.
- **Fix: popup update tab selection.** Popup yt-dlp and Astra Downloader update
  actions now sort YouTube tab candidates and retry tabs with no content-script
  response, so a stale first tab no longer hides a working YouTube tab.
- **Fix: popup import recovery.** Popup backup imports now stage a
  session-scoped undo snapshot before applying settings and local-data writes,
  surface an Undo Import action after success, and restore the prior payload if
  applying the import fails.
- **Security: helper checksum fail-closed setup.** Astra Downloader first-run
  setup now refuses yt-dlp and ffmpeg helper downloads when their SHA-256
  sidecar is missing or malformed, and deletes the untrusted helper before
  retry.
- **Security: pinned source bootstrap dependencies.** Astra Downloader source
  runs now auto-install from `astra_downloader/requirements.txt` instead of
  unpinned package names, so a missing PyQt/Flask/requests/waitress import
  cannot pull an unreviewed major release.
- **Fix: companion non-blocking settings recovery.** Astra Downloader removed
  blocking message boxes from settings, server-start failure, and uninstall
  paths; history clearing now offers an inline Undo action, connection changes
  auto-restart the local server after Save, and helper/token maintenance reports
  through status text, tray notifications, and logs.
- **Fix: side-panel quick settings outage state.** The diagnostics side panel
  now treats failed settings storage reads as an explicit recovery state instead
  of rendering default-looking toggles, and the refresh banner no longer claims
  full success when quick settings could not load.
- **Fix: Firefox side-panel lint readiness.** The popup now feature-detects
  Chrome's side-panel API through guarded dynamic access, keeping the dashboard
  launcher functional on Chrome while removing Firefox AMO unsupported-API
  warnings from both build profiles.

- **Polish: v4.46.31 extension settings command center.** Re-imagined the
  in-page extension settings overlay from a fresh imagegen concept and pushed
  the implementation closer to that mockup: taller full-viewport shell,
  transparent Astra mark, compact command header, wider settings navigation
  rail with completion indicators, amber-accented setting rows, expanded
  status/profile/backup inspector, recent export/import rows, and a centered
  saved-state footer.

- **Fix: v4.46.29 roadmap drain — deep audit follow-through.**
  Implemented all programmatically fixable items from the v4.46.28 deep-audit
  backlog. MAIN-world audio graph: cached MediaElementSourceNode per video in
  a WeakMap and kept the AudioContext alive to prevent InvalidStateError on
  reconnect (audio passthrough when idle). theaterAutoScroll/autoTheaterMode:
  restricted to navigate events only (player-state was re-scrolling on every
  play/pause). video-hider mutation batching: accumulated cards across observer
  callbacks so cancelled batches no longer drop unprocessed items. Takeout
  import: fixed double-count on ledger overflow (recompute totals from
  surviving entries instead of accumulating before cap), raised file cap to
  500 MB, added undo toast. navigation.js: capped pendingMutationRecords at
  2000 with a 2s hidden-tab fallback drain. predicate-sandbox: added a
  top-level-quantifier cap to reject group-free polynomial backtracking.
  player task-manager: fixed retry delay off-by-one. OPML import: nodes with
  both a channel ID and children are now traversed as groups. Expanded eslint
  require-catch-reason to all shipped files. Popup: Reset PIN bypass fixed,
  Export no longer truncates to import caps, capability probe routes through
  background SW to bypass CSP. Side-panel: focus restored after toggles.
  watchTimeTracker: cached sanitized stats to avoid per-tick ledger rebuild.
  generate-locales: prefers mapped translations for current EN over stale
  existing translations. Added 8 i18n keys for import/Takeout surfaces
  across all 11 locales.
- **Fix: v4.46.28 deep audit pass — correctness, teardown, and security.**
  Multi-pass engineering + product audit. Repaired: Subscription Groups init/
  destroy crashing with a `ReferenceError` (the peeled factory never received
  the scoped mutation-rule helpers, so the feature silently never filtered the
  feed and left group-hidden cards stuck after disable); Subscription Groups
  CSV export emitting header-only rows (read `group.channels`, which is never
  populated — membership is stored as `channelIds`); the Digital Wellbeing
  watch-time counter freezing at 30s forever (the tick cache advanced only on
  the non-save branch, so break reminders and the daily cap could never fire and
  storage wrote every second); the budgeted feed-scan runner leaving its promise
  permanently unsettled when an item callback threw; the player task manager
  leaking four window listeners on destroy and double-firing on reinstall; the
  side-panel toggle path overwriting the entire settings object from an empty
  cache and ignoring the storage `areaName`; DeArrow never processing the
  clickbait-heavy watch-page related rail; DeArrow/SponsorBlock resurrecting
  their caches after teardown; the download-history button re-attaching after
  destroy; and the Takeout import accepting future-dated entries that evicted
  genuine recent days. Security: the EXT_FETCH proxy now treats BYO API-key
  headers (`x-api-key`, `x-goog-api-key`, `api-key`) as credentials — scoping
  them to the AI-provider origin allowlist and forcing manual redirects so a
  redirect from an allowlisted API host cannot leak the key; the companion
  `/provision-deno` endpoint now uses a constant-time token comparison. Tooling:
  `check-no-eval` now scans the side-panel/sidebar scripts it claimed to cover,
  and `check-contrast` now fails when its color constants drift from popup.css.
  Also refreshed the stale v3.x "What's New" changelog copy to be version-generic.
- **Feat: v4.46.27 local import summaries and undo.** Settings imports now
  report changed settings, restored local lists, skipped entries, and duplicate
  rows with an immediate Undo toast; Subscription Groups JSON/OPML imports now
  report created, updated, removed, skipped, duplicate, and channel counts while
  keeping the existing no-confirmation undo path.
- **Feat: v4.46.26 YouTube Takeout watch-history import.** Added a local-only
  settings-panel import action for Takeout `watch-history.json`, normalizing
  titles, deduping repeated imports by video ID and watched timestamp, and
  merging recent entries into the existing watch-time analytics store.
- **Fix: v4.46.25 injected-overlay keyboard paths.** Expanded the overlay
  accessibility audit with synthetic Tab/Shift-Tab, Enter/Space, Escape,
  tablist, native select/typeahead, and `aria-expanded` behavior coverage;
  added mutation canaries for settings-panel focus traps, download-popup
  expansion state, and subscription-group Enter submit handling.
- **Fix: v4.46.24 YouTube feed experiment canaries.** Added selector-pack
  coverage for category chips, sponsored feed variants, prompt/survey nudges,
  and Playables shelves, with generated home/search fixture evidence that
  separates DOM-match diagnostics from token-only drift canaries.
- **Fix: v4.46.23 web-accessible-resource review gate.** Build profiles now
  stamp an exact `icons/*` + `assets/*` web-accessible-resource allowlist,
  tests compare source, store-safe, GitHub-full, and reviewer docs, and store
  review copy now explains why bundled theme media is exposed without exposing
  source files.
- **Fix: v4.46.22 Python companion dependency audit gate.** `npm run check`
  now runs `pip-audit` against `astra_downloader/requirements.txt`, writes
  `build/astra-downloader-pip-audit.json` for release review, and fails
  moderate-or-unknown Python findings unless an advisory is explicitly
  reviewed in source.
- **Fix: v4.46.21 Deno runtime trust gate.** Astra Downloader now treats
  Deno below 2.3.0 as stale when current yt-dlp needs the external JavaScript
  runtime, blocks downloads with upgrade guidance, verifies Deno bootstrap ZIPs
  against upstream `.sha256sum` sidecars before extraction, and returns
  structured provisioning failure codes.
- **Polish: v4.46.20 premium settings and diagnostics pass.** Refined the
  in-page settings header/search states, side-panel quick-settings recovery,
  popup onboarding/diagnostics localization, and live Theater Split title
  wrapping; rebuilt the reloadable extension and userscript artifacts.
- **Fix: v4.46.19 i18n coverage freshness gate.** `npm run check` now fails
  stale `docs/i18n-coverage.md` output, the report is regenerated against the
  901-key locale catalog, feature-copy placeholders are zeroed via reviewed
  exact matches, and `generate-locales.js` preserves existing proofed strings.
- **Feat: v4.46.18 feed scan budgeting.** Large Video Hider and Subscription
  Groups feed passes now process cards in cancellable chunks, yield between
  batches, bundle the shared navigation helper into the userscript, and expose
  slow/cancelled scan timing in selector-health diagnostics.
- **Feat: v4.46.17 player-state retry manager.** Added a shared player task
  manager for readiness-aware retries, stale SPA-navigation cancellation, and
  media/player-state reapply events; quality forcing, per-context quality,
  persistent speed, auto theater, theater auto-scroll, and initial play/pause
  now schedule through that shared path.
- **Feat: v4.46.16 userscript parity reduction.** The standalone userscript
  now carries five safe DOM/CSS controls from the extension runtime, mirrors
  the guarded `pauseOtherTabs` BroadcastChannel degradation path, and the drift
  checker caps the remaining `not-yet-ported` parity backlog at 19 classified
  items.
- **Fix: v4.46.15 storage-denied hardening.** `pauseOtherTabs` now degrades
  cleanly when `BroadcastChannel` is blocked, and the crash-loop guard keeps
  a storage-backed or in-memory safe-mode path when browser privacy settings
  deny `localStorage`.
- **Chore: release readiness artifact build.** `npm run build:userscript`
  now emits the CycloneDX production SBOM, release manifest, and SHA256SUMS,
  and `npm run release:prepare` builds those artifacts before enforcing the
  local release-readiness gate.
- **Fix: v4.46.14 release-doc truth gate.** Active architecture, repo-settings,
  and signing-key docs now match the local-only build/release policy and current
  product version, and `check-versions` fails if active docs drift back to
  retired workflow paths, retired research-report links, or stale current-version
  claims.
- **Feat: v4.46.13 subscription OPML bridge.** Subscription Groups can export
  and import OPML with duplicate-channel handling, malformed-file recovery,
  capped group/channel rows, and Undo-backed import status while keeping
  JSON/CSV backups intact.
- **Chore: v4.46.12 userscript parity classification gate.** The userscript
  drift checker now classifies all extension-only feature IDs as chrome API,
  native companion, unsafe in userscript, intentional extension-only, or
  not-yet-ported; new unclassified IDs now fail local checks with the allowed
  class list.
- **Fix: v4.46.11 legacy health token echo switch.** Astra Downloader now has a
  `LegacyHealthTokenEcho` / `ASTRA_LEGACY_HEALTH_TOKEN_ECHO=0` cutover gate
  that suppresses `/health` token disclosure for non-native callers, and the
  extension reports a `native-channel-required` recovery path instead of a
  misleading install prompt.
- **Fix: v4.46.10 downloader failure recovery codes.** Astra Downloader now
  classifies PO-token, provider-staleness, SABR, Deno, sign-in, ffmpeg, and
  network failures with stable `error_code` values; the extension and
  userscript show matching recovery guidance and record the code in
  diagnostics.
- **Polish: v4.46.9 dashboard and popup degraded states.** Side-panel
  diagnostics now hide empty metric chips, render structured recovery states,
  and explain unavailable storage; the toolbar popup now treats missing
  extension storage as preview mode instead of corruption, adapts to narrow
  public preview containers, and hides unavailable version badges.
- **Fix: v4.46.8 live Theater Split title containment.** Live split headers now
  remove the title line clamp, grow to the full wrapped title height, and cap
  misreported native action-control widths so live titles no longer clip or
  trail off the right pane on narrow chat layouts.
- **Fix: v4.46.7 live Theater Split title wrapping.** Live split headers now
  bound the native action column, wrap long stream titles inside the right
  pane, grow the measured header height, and offset live chat below the title
  area in the Chrome extension and standalone Theater Split userscript.
- **Polish: v4.46.6 settings modal refresh.** Reworked the in-page settings
  shell with a dedicated PIN/header action group, tighter search/sidebar copy,
  bounded desktop layout, aligned feature rows, custom select chrome, stronger
  player-overlay z-index, and refreshed Chrome reload artifacts.
- **Release: v4.46.5 Chrome reload build.** Product version surfaces now
  agree at `4.46.5`, and fresh Chrome/Firefox validation artifacts plus the
  userscript copy were rebuilt from the polished settings/dashboard code.
- **Polish: settings and diagnostic dashboard experience.** Reworked the
  side-panel/sidebar dashboard into a premium grouped diagnostics surface,
  upgraded Quick Settings search/filter states, added visible status feedback
  to in-page settings save/import/export/reset flows, and tightened side-panel
  hidden/focus accessibility contracts.
- **Docs: companion release status sync.** `docs/native-messaging-token-bootstrap.md`
  reflects the implemented native-first token bootstrap with legacy `/health`
  fallback, and README / blocked-roadmap notes match the `v4.46.4`
  release state where `AstraDownloader.exe` is attached but its `.sha256`
  sidecar still needs maintainer upload.
- **Refactor: video notes monolith peel.** The per-video local notes runtime
  now lives in `extension/features/video-notes/index.js` with inline fallback,
  manifest/userscript bundle wiring, raw-CSS userscript parity, and focused
  peel coverage.
- **Feat: Firefox diagnostic sidebar fallback.** Firefox builds now get a
  `sidebar_action` entry pointing at a sidebar version of the existing
  diagnostic dashboard, while Chrome keeps the `side_panel` manifest path.
- **Refactor: settings panel monolith peel.** The in-page settings panel
  controller, renderer, search/filter state, delegated UI listeners, and toggle
  refresh path now live in `extension/features/settings-panel/index.js` with
  inline fallback, manifest/userscript bundle wiring, and focused peel coverage.
- **Refactor: digital wellbeing monolith peel.** The break-reminder,
  daily-cap, and day-rollover timer runtime now lives in
  `extension/features/digital-wellbeing/index.js` with inline fallback,
  manifest/userscript bundle wiring, and focused peel coverage.
- **Refactor: subscription groups monolith peel.** The subscription-groups
  runtime now lives in `extension/features/subscription-groups/index.js` with
  an inline `ytkit.js` fallback, manifest/userscript bundle wiring, and peel
  coverage for factory export, runtime surface, load order, and delegation.
- **Feat: transcript study batch export.** Study / Work Export can now queue
  visible watch, playlist, and channel videos for local transcript fetches,
  show per-video pending/success/failure state, and export paired Markdown
  plus JSONL study packs with capped queue size, capped retries, timestamps,
  language metadata, and failure reasons.
- **Feat: external API health dashboard.** SponsorBlock, DeArrow, and Return
  YouTube Dislike now report last success, error class, cache/fallback state,
  and request budget into popup/sidepanel diagnostics and saved bug-report
  bundles.
- **Security: native-messaging token bootstrap cutover.** Astra Downloader now
  registers Chrome/Firefox native host manifests for configured extension IDs,
  the extension prefers the browser-pinned native token before `/health`, and
  `/health` suppresses token echo once native bootstrap succeeds.
- **Feat: Audio pan control.** New `audioPan` range setting (-1.0 to 1.0)
  adds a `StereoPannerNode` to the SharedAudio MAIN world audio graph.
  Default 0 (center). Bridges to MAIN world via `data-ytkit-audio-pan`
  attribute. i18n keys added across all 11 locales.
- **Feat: Focus preset for onboarding wizard.** New `presetFocus` preset
  (4th option alongside Privacy, Researcher, Power User) enables distraction-
  removal features: hide Shorts, related videos, infinite scroll, notifications,
  autoplay + Zen Mode, Digital Wellbeing, Focused Mode, auto-close popups.
  Toggle off restores prior values. Onboarding wizard button added to popup.
  i18n keys added across all 11 locales.
- **Docs: Trust & Transparency section in README.** Added 8-point trust
  summary: open-source, no telemetry, SBOM/attestation, external CRX signing,
  credential scrub, profile-split permissions, 26+ hardening passes, privacy
  policy.
- **Security: Sanitizer API progressive adoption.** `setTrustedHTML()` in
  `core/trusted-html.js` now feature-detects `Element.prototype.setHTML`
  (Chrome 146+, Firefox 148+) and uses browser-native sanitization when
  available. Falls back to the existing DOMParser + TrustedTypes path on
  older browsers.
- **Feat: DeArrow Casual Mode.** New `deArrowCasualMode` setting (off by
  default). When enabled, keeps descriptive original titles unchanged and only
  replaces titles that have crowd-submitted DeArrow alternatives. Gates the
  local fallback formatting path so videos without community submissions show
  their original metadata. i18n keys added across all 11 locales.
- **i18n: complete Russian locale translation.** Translated 66 placeholder-
  identical keys to Russian. Coverage jumped from 92.2% to 98.9% (1 remaining
  placeholder-identical key). All 11 locales now above 97%.
- **Fix: userscript drift checker — exclude extension-only download-ui module.**
  Added `EXTENSION_ONLY_FEATURES` allowlist to `check-userscript-drift.js` so
  `features/download-ui/index.js` (which depends on chrome.downloads) is not
  flagged as a missing V5_BUNDLE_MODULES entry. Drift check now passes clean.
- **Security: SponsorBlock anti-detection monitoring.** Skip timing now includes
  50-200ms random jitter to reduce detection fingerprint (SponsorBlock #2290).
  Added periodic `_checkAntiAdblock` monitor that detects YouTube enforcement
  warning DOM elements and records to DiagnosticLog. Timer cleaned up on destroy.
- **A11y: Side Panel accessibility parity with popup.** Added landmark roles
  (`banner`, `main`, `contentinfo`), `aria-labelledby` on all sections,
  `aria-live="polite"` on dynamic counts, `role="status"` on empty states,
  `aria-controls` on the search input, `aria-label` on every setting toggle
  row and the refresh button, skip-link to settings, and `:focus-visible`
  styles on all interactive elements. Static ARIA attributes increased from
  8 to 21 (plus JS-generated per-row attributes). 3 new hardening tests pin
  the a11y surface.
- **Security: pin aria2c external-downloader ban (CVE-2026-50574).** Verified
  the companion never passes `--external-downloader aria2c` to yt-dlp. Added
  two source-analysis tests asserting the invariant: no `aria2` references and
  no `--external-downloader` flag in the download subprocess construction.
- **Fix: merge all MAIN world audio into single AudioContext.** Mono-to-stereo
  (Feature 3) and volume boost/normalization (Feature 4) each had independent
  AudioContexts calling `createMediaElementSource()` on the same video — a
  Web Audio API spec violation that causes `InvalidStateError`. Consolidated
  into a single shared graph: source -> monoMerge -> compressor -> gain ->
  destination. Each node passes through when its feature is disabled.
- **Fix: native messaging double-sendResponse race.** The `NATIVE_MSG_GET_TOKEN`
  handler's timeout, onMessage, and onDisconnect callbacks all called
  `sendResponse`. Added a `responded` guard so only the first path through
  delivers the response.
- **Fix: download-ui health panel `_poll()` undefined.** The Deno provisioning
  success callback called `this._poll()` which doesn't exist. Changed to
  `this._render()`. Also added `_destroyed` guard to the 30s poll interval.
- **Fix: download popup missing aria-expanded.** Speed popup correctly set
  `aria-expanded` on its anchor but download popup didn't. Added consistent
  aria-expanded management to the download popup.
- **Fix: sidepanel setting names.** Toggle labels now convert camelCase keys
  to human-readable form (`hideCreateButton` → `Hide Create Button`).
- **SharedAudio: volume boost + audio normalization.** New MAIN world audio
  features via `ytkit-main.js`: `volumeBoost` amplifies audio beyond 100%
  via a GainNode (1-10x, configurable via `volumeBoostLevel` range setting);
  `audioNormalization` compresses dynamic range via a DynamicsCompressorNode
  so quiet and loud passages play at similar volume. Both share a single
  AudioContext and audio graph (source -> compressor -> gain -> destination).
  Off by default; i18n keys added across all 11 locales.
- **Native messaging token bootstrap.** Extension-side `NATIVE_MSG_GET_TOKEN`
  handler in background.js uses `chrome.runtime.connectNative()` to request
  the companion token via a browser-pinned stdio pipe. Falls back to HTTP
  `/health` when native messaging is unavailable or the host manifest is
  not registered. `nativeMessaging` permission added to manifest; rationale
  doc updated. Companion-side handlers were already scaffolded.
- **Monolith decomposition: Download UI peel.** Extracted 1,626 lines of
  download UI code into `extension/features/download-ui/index.js`:
  MediaDLManager singleton, ytKitDownload orchestrator, showDownloadPopup,
  showDownloadProgress, downloadHealthPanel, downloadStreamLinksPanel,
  downloadCobaltFallback, downloadHistoryPanel. Monolith delegates through
  the factory with inline fallback. 826 tests pass (5 new).
- **Companion module split.** Split `astra_downloader.py` into focused
  re-export modules: `config.py`, `download.py`, `health.py`, `routes.py`,
  `gui.py`. Each module is independently importable for testing. The main
  entry point and test import path unchanged. All 146 Python tests pass.
- **Userscript: subscription groups.** Ported group CRUD, chip filtering,
  6 sort modes, digest panel, channel membership editor, CSV/JSON
  export/import, content-type filter, and new-since-last-visit markers
  to the userscript. Omits AI tags (Chrome API) and queue playback.
- **Chrome Side Panel: settings panel.** The Side Panel diagnostic dashboard
  now includes a full schema-driven settings panel with search filter,
  toggle switches, and live sync to YouTube tabs. Persists across SPA
  navigation (unlike the in-page panel). Loads `settings-schema.js` for
  the full 380-entry schema. Firefox falls back to the in-page panel.
- **Userscript: SponsorBlock integration.** The userscript now fetches
  crowdsourced skip segments via the SponsorBlock hash-prefix privacy API,
  auto-skips enabled categories during playback, and renders colored
  segment bars on the progress bar. Same 9 category toggles as the
  extension (sponsor, intro, outro, selfpromo, interaction, music_offtopic,
  preview, filler, poi_highlight). Uses GM_xmlhttpRequest for cross-origin
  API access. Cached locally with 12-hour TTL and 500-entry LRU cap.
- **Popover API adoption for player popup menus.** Speed popup and
  download popup now use `popover="auto"` with `showPopover()` /
  `hidePopover()` when the Popover API is available (Chrome 114+,
  Firefox 125+, Safari 17.4+). Provides native dismiss-on-outside-click
  and Escape handling via the platform. Manual click/keydown listener
  fallback retained for browsers without support.
- **i18n: batch-translate feature definitions across all 10 locales.**
  All `feature_*_name` and `feature_*_desc` keys translated from English
  to Arabic, German, Spanish, French, Italian, Japanese, Korean, Brazilian
  Portuguese, Russian, and Simplified Chinese. Coverage jumped from
  21–27% to 92–99% across all non-EN locales (889 EN keys). Unblocks
  credible CWS/AMO multi-language submission claims.
- **Security: cap regex input length for user-supplied filter patterns.**
  `hideVideosFromHome` regex tests now cap title at 500 chars, channel at 200.
  `commentFilterManager` regex tests cap body at 2,000 chars, author at 200.
  Bounds worst-case backtracking time regardless of pattern complexity.
- **Perf: popup toggle click delegation.** Replaced per-row
  `addEventListener('click')` in `render()` with a single delegated click
  handler on `#toggles`. Eliminates detached-DOM listener accumulation
  when the toggle list is rebuilt on every setting change.
- **Fix: DeArrow cache timestamp gate.** `_doFetch()` now checks whether
  the existing cache entry has a newer `_ts` before overwriting, preventing
  a staler concurrent response from replacing fresher data.
- **Security: companion subprocess env whitelist.** yt-dlp subprocesses now
  receive a minimal whitelisted environment (`PATH`, `SYSTEMROOT`, `TEMP`, etc.)
  instead of the full `os.environ.copy()`. Prevents a compromised `PYTHONPATH`
  or `LD_LIBRARY_PATH` from hijacking yt-dlp execution.
- **Security: companion download size cap.** New `MaxFileSizeMB` config key
  (default 0 = unlimited) passes `--max-filesize` to yt-dlp when set. Prevents
  disk exhaustion from queueing extremely large videos.
- **Security: companion queue size cap.** Download queue hard-capped at 200
  total entries (`MAX_QUEUED_TOTAL`). Prevents memory exhaustion from a
  compromised extension flooding `/download` with requests.
- **Security: fix double-sendResponse race in EXT_FETCH.** The `responded`
  guard was scoped inside `startFetch()` but the permission-check `.catch()`
  path was outside that scope. If `startFetch()` threw synchronously after
  the timeout timer was armed, both the `.catch()` and the timeout could
  call `sendResponse`. Hoisted `responded` to the outer scope and added
  a guard on the `.catch()` path.
- **Security: harden response header reconstruction.** Strip `\r\n` from
  response header values before joining into the CRLF-delimited string
  returned to the content script. The Fetch API normalizes headers in
  practice, but the explicit strip prevents injection via any edge case.
- **Security: add sandbox attribute to age-restriction bypass iframe.**
  The embedded YouTube player iframe now carries
  `sandbox="allow-scripts allow-same-origin allow-presentation"` and
  validates the videoId format before constructing the embed URL.
- **Security: reject unsafe object keys in subscription group imports.**
  `_importGroups()` now checks `isSafeObjectKey()` on both group IDs and
  parent IDs, preventing `__proto__`/`constructor` prototype pollution
  from malicious JSON payloads.
- **Security: validate Innertube API key format in transcript service.**
  `_method2_InnertubeAPI()` now validates the extracted API key matches
  `^[a-zA-Z0-9_-]{10,}$` and uses `encodeURIComponent()` in the URL,
  preventing parameter injection from a crafted page.
- **Security: add cookie domain allowlist to companion downloader.**
  `write_cookies_netscape()` now rejects cookies whose domain is not in
  `ALLOWED_COOKIE_DOMAINS` (YouTube, Google auth). Prevents a compromised
  extension from injecting cookies for arbitrary domains into the yt-dlp
  cookie jar.
- **Security: add X-Content-Type-Options and X-Frame-Options headers to
  companion Flask responses.** Defense-in-depth for the local REST API.
- **Fix: mono-to-stereo AudioContext leak on disable.** Disabling the
  feature previously called `syncMerge()` (adjusting channel count) but
  left the AudioContext, source node, and gain node alive. Now calls
  `cleanup()` to properly close the AudioContext and disconnect all nodes.
- **Fix: data-flow origin matching logic error.** `originMatchesManifest()`
  used a bidirectional `startsWith` check that incorrectly matched
  `https://youtube.com` against `https://www.youtube.com/*`. Replaced
  with proper URL parsing and hostname comparison.
- **Privacy: strip query/fragment from tab URL in selector-health reports.**
  The copy-to-clipboard and bug-report export now include only the origin
  and pathname, preventing accidental disclosure of private playlists or
  video IDs in pasted issue reports.
- **Chrome Side Panel dashboard:** new `sidepanel.html` provides a persistent,
  resizable diagnostic dashboard with feature init timing, selector health, and
  storage stats. Opens via the "Dashboard" button in the popup. Chrome-only
  progressive enhancement (Firefox hides the button; the `sidePanel` permission
  and `side_panel` manifest entry are stripped from Firefox builds by
  `manifest-patch.js`). The side panel runs in the extension context — no
  Trusted Types concerns. Permission rationale doc updated.
- **Mono-to-stereo audio conversion:** new `monoToStereo` feature uses the MAIN
  world Web Audio API bridge to force mono downmix via a channelCount=1 gain node,
  then the browser's built-in mono-to-stereo upmix centers the signal equally in
  both ears. Fixes one-sided recordings, lectures, and old content that sounds
  unbalanced on headphones. Off by default; the audio graph stays passthrough
  when disabled so stereo content is unaffected.
- **Onboarding wizard:** the first-run welcome card now has a second step after
  profile selection (Store-Safe / GitHub-Full). Step 2 offers three preset
  profiles — Privacy, Researcher, Power User — or a "Skip" option for manual
  configuration. Selecting a preset applies it via the existing recipe-toggle
  system with backup snapshots for safe toggle-off.
- **Structured companion error log:** `write_persistent_log` now records entries
  to a 20-entry in-memory ring buffer alongside the disk log. The `/health`
  endpoint includes a `recentErrors` array with the latest log entries, making
  companion-side diagnostics accessible from the extension's diagnostic download.
- **Crash-loop auto-recovery:** if the content script crashes 3+ times within
  30 seconds (tracked via localStorage timestamps), Astra Deck auto-enters safe
  mode and shows a 15-second toast explaining what happened. The counter is
  cleared on successful init. This protects against corrupted-settings crash
  loops that would otherwise require the user to know about `?ytkit=safe`.
- **Feature performance dashboard:** new popup section showing the slowest
  feature init times with visual bars. Queries the content script via
  `YTKIT_GET_FEATURE_PERF` for lifecycle timing data. Features > 50ms are
  flagged in red. Hidden when no YouTube tab is active.
- **Subscription content-type filter:** `subscriptionFilterLive` and
  `subscriptionFilterStreamed` toggles hide live/upcoming and previously-streamed
  cards from the subscription feed. Uses CSS class filtering alongside the
  existing group filter.
- **Video Flip:** new `videoFlip` feature with `videoFlipMode` select
  (none/horizontal/vertical/both). Mirrors the video via CSS `scale` property,
  composing cleanly with existing `videoRotation` transforms. Useful for mirrored
  dance tutorials, text readability, and flipped recordings.
- **Security: pin Werkzeug >= 3.1.6 and Jinja2 >= 3.1.6 in requirements.txt.**
  Flask 3.1.3 did not constrain these transitive dependencies. CVE-2026-21860
  and CVE-2026-27199 (Werkzeug path traversal via Windows device names in
  `safe_join()`) and CVE-2025-27516 (Jinja2 sandbox escape) are now floor-pinned
  so fresh installs and CI cannot resolve to vulnerable versions.
- **Feature module test coverage:** added dedicated test files for 9 peeled
  feature modules that lacked unit coverage: return-dislike, player-dock,
  youtube-music-compat, blue-light-filter, subtitles, home-subs-css,
  video-filters, wave-8-css, theme-css. All 14 peeled modules now have
  test files in `tests/features/`. Total test count: 821 (up from 800).
- **Reliability: companion Deno provisioning error logging + temp cleanup.**
  `provision_deno()` silently swallowed all exceptions via bare
  `except Exception: return None`. Now logs errors to the persistent log.
  Also cleans up partial `tmp_exe` extraction artifacts in the `finally`
  block to prevent orphaned temp files on permission errors.
- **Reliability: add catch handlers to SponsorBlock segment reload promises.**
  Three `_loadForVideo().then(...)` calls in the SponsorBlock peeled module
  and monolith fallback lacked `.catch()` handlers, risking unhandled
  promise rejections on network errors or unexpected runtime exceptions.
  Added `.catch(() => {})` with `reason:` comments.
- **Security: scrub DeArrow private userID from settings exports.**
  The `ytkit-da-user-id` storage key (locally generated DeArrow voting
  identity) was not covered by the `ALWAYS_SCRUB_KEY_PATTERNS` in
  `core/policy-profile.js`. Settings exports would include the raw user
  ID, allowing cross-device identity correlation. Fixed: added explicit
  pattern `^ytkit-da-user-id$` to the scrub list.
- **Audit: fix 4 bugs from PO Token resilience refactor:**
  - Transcript viewer: `trackLabel` variable was scoped inside an `else`
    block but referenced outside it, causing `undefined` in the metadata
    bar. Fixed: `trackLabel` now declared at correct scope.
  - Subtitle download: `track.languageCode` referenced an undeclared
    variable after refactor to `fetchTranscriptWithFallback`. Fixed: uses
    `result.track?.languageCode` now.
  - AI summary: redundant engagement-panel fallback after
    `fetchTranscriptWithFallback` already covers it. Fixed: removed dead
    code path.
  - Transcript fetch helper: added guard for missing/corrupt `baseUrl`
    on caption tracks to prevent fetching `undefined&fmt=json3`.
  - Fixed curly/smart apostrophes (`'`) in string literals that caused
    JavaScript syntax errors breaking the content script parser.
- **Transcript PO Token resilience:** all transcript fetch paths (transcript
  viewer, subtitle download, AI video summary, local AI summary, transcript
  Q&A, transcript index) now fall back to engagement-panel HTML scraping when
  YouTube's timedtext API returns empty or errors due to Proof-of-Origin
  Token requirements. Failures are logged to the diagnostic log under the
  `transcript-po-token` category. New shared `fetchTranscriptWithFallback()`
  and `_scrapeEngagementPanelTranscript()` helpers replace direct
  `captionTrack.baseUrl + '&fmt=json3'` fetches.
- **DeArrow voting:** new `deArrowVoting` feature adds thumbs up/down vote
  buttons on watch-page titles replaced by DeArrow. Votes use a locally
  generated private userID that never leaves DeArrow requests and is
  excluded from settings exports. The DeArrow `_processPage` now stamps
  replaced titles with `data-ytkit-dearrow-original` and
  `data-ytkit-dearrow-uuid` attributes. Off by default; extension-only.
- **Threaded comment DOM adaptation:** updated `core/selector-packs/comments.js`
  with threaded reply container selectors (`#more-replies-sub-thread`,
  `#expanded-threads`, `#expander-contents`) for YouTube's 3-level nested
  comment threading (Jan–March 2026 rollout). Verified that `commentSearch`,
  `commentNavigator`, `sortCommentsNewest`, and `commentEnhancements` all
  handle nested replies correctly through existing `textContent` and
  thread-level traversal patterns.
- **CSS Anchor Positioning for popups:** the speed popup and download popup
  now use CSS Anchor Positioning (Baseline 2026: Chrome 125+, Firefox 147+)
  when available. Popups are anchored to their trigger buttons with automatic
  flip-block fallback. JS `getBoundingClientRect` positioning is kept as a
  fallback for browsers that don't support `anchor-name`. No visual change
  on supported browsers — positioning is identical but now handled by CSS.
- **Transcript Q&A (Chrome Prompt API / Gemini Nano):** new
  `localAiTranscriptQa` feature adds a "Q&A" button next to the AI summary
  controls. When Chrome 138+'s Prompt API is available, users can ask
  questions about the current video's transcript and get on-device answers
  from Gemini Nano. No API keys needed; runs entirely locally. Graceful
  fallback when the API is unavailable. Off by default. Added `promptApi`
  capability probe to detect API availability.

- **DeArrow monolith peel:** the DeArrow feature (API fetch, branding cache,
  title formatting, thumbnail replacement) is now in
  `features/dearrow/index.js`. The monolith delegates to the factory via
  `YTKitFeatures.createDeArrowFeature(deps)` with the inline implementation
  as a compatibility fallback.
- **SponsorBlock monolith peel:** the ~480-line SponsorBlock feature
  (hash-prefix API fetch, segment cache, skip scheduling, progress bar
  painting) is now in `features/sponsorblock/index.js`. The monolith
  delegates to the factory via
  `YTKitFeatures.createSponsorBlockFeature(deps)` with the inline
  implementation as a compatibility fallback.
- **Chrome Language Detector API for antiTranslate:** when Chrome 138+
  Language Detector API is available, the antiTranslate feature uses it to
  detect whether a video title/description has been auto-translated by
  YouTube. Falls back to the existing text-comparison heuristic when the
  API is unavailable. Added `languageDetector` capability probe.
- **Return YouTube Dislike feature peel:** the ~200-line RYD feature
  (API fetch, cache, dislike pill, ratio badge) is now in
  `features/return-dislike/index.js`. The monolith delegates to the factory
  via `YTKitFeatures.createReturnDislikeFeature(deps)` with the inline
  implementation as a compatibility fallback.
- **Download outcome telemetry:** download completion, failure, skip, and
  cancellation now record entries in the diagnostic log under the
  `download-outcome` category. The diagnostic download JSON includes
  these entries for troubleshooting download complaints.
- **SponsorBlock-adjusted remaining time:** when both `remainingTimeDisplay`
  and `sponsorBlock` are enabled, the remaining time display now subtracts
  the total duration of auto-skip segments ahead of the current playback
  position. Matches the common adjusted-remaining-time behavior.
- **SABR download failure diagnostic:** when yt-dlp fails because all available
  formats were SABR-only, the download progress panel now shows a clear error
  message explaining the limitation instead of a generic failure. The download
  health panel surfaces a new "SABR: limited" warn pill so users understand why
  some videos may not download. Companion `/health` now includes `sabrSupport`
  field.
- **i18n coverage CI gate:** `scripts/i18n-coverage.js` gains `--fail-above <n>`
  flag that exits non-zero when any non-English locale exceeds n
  placeholder-identical keys. Wired into `npm run check` at threshold 670
  (just above the current worst-case locale, ratchets down as translations
  land). Prevents locale coverage regression.
- **View Transitions on SPA navigation:** `core/navigation.js` now wraps
  navigate-rule execution in `document.startViewTransition()` when available
  (Baseline 2025, all major browsers). Feature UI teardown/rebuild animates
  smoothly on YouTube SPA navigation. Falls back to direct execution on
  browsers without support.
- **Companion auto-provisions Deno:** when yt-dlp >= 2026.04 needs an
  external JS runtime and no Deno is found on PATH, the companion
  auto-downloads Deno into `%LOCALAPPDATA%\AstraDownloader\deno\` during
  setup. New `/provision-deno` POST endpoint lets the extension trigger
  on-demand provisioning. The health panel Deno pill is now clickable when
  Deno is missing — one click triggers auto-provision. `probe_deno_runtime`
  now returns a `source` field (`bundled` or `system`). The yt-dlp
  subprocess PATH is prepended with the bundled Deno directory when present.
- **Subscription group CSV export:** new CSV button alongside the existing
  JSON export on the subscription groups toolbar. RFC 4180 compliant with
  formula-injection neutralization. Columns: Group, Channel, Handle, URL.
- **Onboarding preset profiles:** three curated settings bundles — Privacy
  (clean URLs, no Shorts, no AI Summary), Researcher (transcript viewer,
  bookmarks, watch time, AI summary), and Power User (speed, stats, A-B
  loop, focused mode). Each follows the existing recipe-toggle pattern with
  backup snapshot for safe toggle-off. All off by default.
- **Settings PIN protection:** optional 4-6 digit PIN gates the in-page
  settings panel and popup management actions (export/import/reset). PIN
  stored as SHA-256 hash in `chrome.storage.local` (standalone key,
  separate from settings export). Set/change/clear via the PIN button in
  the settings panel header. "Forgot PIN?" recovery clears all settings.
  Credential scrub pattern added to `policy-profile.js`.
- **Document PiP cross-browser:** updated `popOutPlayer` for Firefox 151+
  stable Document PiP support (no about:config flag needed). Added
  `documentPip` capability probe so the popup can surface availability.
  Firefox fallback message now version-aware — 151+ gets a generic retry
  hint, older Firefox gets an upgrade suggestion.
- **Per-feature performance timing:** `initFeatureLifecycle` and
  `destroyFeatureLifecycle` now capture `performance.now()` elapsed time.
  `initMs`/`destroyMs` fields are stored in the registry health snapshot
  and the lifecycle snapshot, surfaced in the diagnostic download JSON.
- **yt-dlp pin bump 2026.3.17 → 2026.6.9:** closes three CVEs (cookie leak
  with curl, dangerous file type creation, aria2c manifest vulnerability) and
  picks up YouTube extractor improvements. The companion does not use `--exec`
  or aria2c, so the yt-dlp 2026.06.09 breaking changes are non-impacting.
- **SponsorBlock per-channel profiles:** added an opt-in watch-page channel
  chip for overriding SponsorBlock skip categories per channel, with profile
  data capped at 500 entries and wired through schema/defaults/export guards.
- **Theater Split premiered-video comments:** hidden/collapsed live-chat
  placeholders no longer switch the right panel into chat mode when the watch
  page has a normal comments surface. Premiered videos now keep comments
  visible instead of reserving a blank chat band in `#ytkit-split-right`.
- **Dependency review enforcement:** removed the `DEPENDENCY_REVIEW_REQUIRED`
  advisory gate; the dependency-review CI job now always fails the workflow run
  on moderate-or-higher vulnerabilities without `continue-on-error`.
- **Arabic locale + RTL support:** added `extension/_locales/ar/` with 865
  translated keys. Popup and settings panel dynamically set `dir="rtl"` for RTL
  locales (Arabic, Hebrew, Farsi, Urdu). RTL CSS overrides handle search icons,
  switch toggles, sidebar borders, and language selector layout.
- **Zen Mode:** new `zenMode` watch-page feature that dims the page around the
  video player using a static CSS `::before` overlay. It avoids
  `backdrop-filter` so the focus effect stays cheap on long YouTube sessions.
- **Sleep Timer polish:** replaced the blocking browser prompt with an inline
  player popover, quick minute presets, validation feedback, and cleanup on
  cancel/start/destroy. Settings copy now describes the workflow directly.
- **Userscript overlay hardening:** removed blur filters from injected chips,
  dropdowns, miniplayer chrome, and page-modal overlays so long sessions avoid
  expensive live backdrop effects.
- **Dependency hardening:** updated the Firefox tooling chain to `web-ext`
  10.4.0, clearing vulnerable dev transitive packages including `shell-quote`,
  `tmp`, and `undici`.
- **Play subscription group as queue:** "Play All" button on the subscription
  group toolbar collects visible video IDs and opens `/watch_videos` (capped at
  50 IDs) in a new tab.
- **Companion update TOCTOU fix:** the PowerShell/Python update helper now
  re-verifies the staged EXE's SHA-256 digest before `MoveFileEx`, closing the
  time-of-check-to-time-of-use window.
- **ESLint 10 config consolidation:** deduplicated four config blocks into two
  using shared plugin and languageOptions objects; confirmed no deprecation
  warnings on ESLint 10.2.1.
- **crx3 supply chain audit:** verified all 6 transitive deps are MIT/BSD,
  `protocol-buffers-schema` is post-advisory, `npm audit` clean.
- **Playlist search:** new `playlistSearch` feature adds a debounced search
  input above playlist panels; filters items by title with Escape-to-clear.
- **Chrome Translator API:** transcript viewer shows a "Translate" button when
  Chrome's built-in Translator API is available (138+). Translates cue text
  on-device with auto-detected source language; "Show Original" toggles back.
  Graceful degradation when API unavailable.
- **Classic Player Chrome:** new `classicPlayerChrome` toggle restores the
  pre-Delhi/Liquid Glass player look in one click — opaque square controls,
  solid red 3px progress bar, transparent time wrapper, no frosted glass on
  player overlays. CSS-only, no DOM rebuild.
- **Video age newest highlight:** `videoAgeColors` now highlights the freshest
  video on the subscriptions page with a stronger green glow and auto-scrolls
  to it on first load. Navigate resets the scroll target.
- **Userscript drift guard:** new `scripts/check-userscript-drift.js` (wired
  into `npm run check`) enforces the V5_BUNDLE_MODULES ↔ manifest feature
  module parity contract. New peeled features that land in the manifest without
  a matching bundle entry fail CI.

## [4.46.3] - 2026-06-10

Deep engineering + product-quality audit pass across the extension, userscript,
companion app, build system, and CI.

### Repo & CI baseline
- **Restored the public product-doc set** (changelogs, INSTALL, CONTRIBUTING,
  SECURITY, HARDENING, ROADMAP, docs/, GitHub issue/PR templates) that the
  markdown purge untracked: the validate suites read these files, so any fresh
  clone failed `npm test` and `pytest`, every docs link in the README 404'd,
  and the store-required privacy-policy URL was unreachable. True working
  notes stay local-only.
- **Added `.gitattributes` (eol=lf):** a `core.autocrlf=true` Windows checkout
  failed 8 tests that were green in CI because the suite slices sources with
  `\n`-anchored regexes. Checkouts now match the Linux runners on every
  platform.
- **Release attestation is now retryable:** the v4.46.2 release run failed on a
  transient sigstore/rekor timeout after a successful build. Attestation gets a
  second attempt before failing, and the build job has a timeout.

### Security & data integrity
- **Settings backups no longer re-enable features on import.** Schema-only
  exports stripped the internal version stamp, so every import re-ran the
  legacy migrations and force-flipped `hidePinnedComments` /
  `autoExpandComments` back on. Imports now seed from the backup's schema
  version, and the seeding migrations only apply when the key is absent
  (popup and in-page importers).
- **Mixed-version safety:** the storage-change relay and profile load no longer
  lower a newer settings-schema stamp written by a newer build (the same
  downgrade hazard 4.46.1 closed for `load()`).
- **Companion: crashed download loops no longer orphan yt-dlp.** The
  exception path now terminates the process tree before the in-use cookie
  jar is deleted.
- **Companion: self-update can no longer reinstall the same binary in a loop**
  when the main-branch version is bumped ahead of the published release —
  the downloaded artifact's digest is compared against the running binary
  and the last-installed digest.
- **Companion: bounded helper downloads** (yt-dlp/ffmpeg/update fetches now
  enforce a 500 MB ceiling while streaming) and the yt-dlp/ffmpeg version
  caches are lock-guarded like the other probe caches.
- **Build artifacts can no longer ship a stray key:** `.pem`/`.log` files
  inside `extension/` are excluded from staging, and the release-readiness
  gate scans the whole extension tree for keys instead of just the repo root.
- **Bug-report bundles** now redact via the same scrub patterns as settings
  exports, so the two redaction surfaces can't drift.

### Fixed — extension
- **Video Notes:** a note typed within the save-debounce window of a
  navigation was saved under the *next* video's id (and clearing a note could
  delete the next video's note). Pending saves are captured per-video and
  flushed before teardown.
- **Subscription Groups:** groups can finally be populated from the UI — an
  "Edit channels" panel adds/removes the channels rendered in the feed
  (the old description promised drag-in that never existed); selecting an
  empty group now shows an explanatory notice instead of a blank feed;
  "YouTube default" sort actually restores the original order instead of
  keeping the previous mode's ordering; the duration sort reads badges on
  the new lockup-view-model cards instead of mis-parsing title timestamps;
  the digest "Mark read" toast counts channels, not videos; staged
  unsubscribes past their 30-day undo window are now actually pruned; and
  toggling the feature on from a non-subscriptions page no longer leaves it
  inert until the second visit.
- **Stream Links panel:** no longer serves the cold-load video's expired
  stream URLs after SPA navigation — it reads the live player response,
  validates the video id, and closes on navigation.
- **Download health pill / Cobalt fallback:** untracked navigation timers
  could resurrect the UI (and fire health probes) after the feature was
  disabled; timers are tracked and cleared.
- **Theater Split:** disabling the feature while a watch page was still
  loading could mount a style-less zombie overlay with no teardown path —
  pending element-waits are now cancelled on destroy (module and fallback).
- **Transcripts:** the DOM-panel fallback emitted Innertube continuation
  tokens as fetch URLs (turning "no transcript" into a fake network error),
  and a valid-but-empty json3 response blocked the XML fallback.
- **Predicate filters:** malformed numbers (`1.2.3`) now fail at compile time
  with a position instead of silently compiling an always-false predicate.
- **Popup:** clearing the search via × or Escape now also resets the schema
  overview; inline number/string editors clamp through the same policy as
  imports; a storage-corruption warning no longer triggers an endless
  diagnostic write/render loop while the popup is open.

### Fixed — userscript & standalone scripts
- **The MediaDL install prompt pointed at a deleted PowerShell installer
  (HTTP 404) and asked users to `irm | iex` it.** All four install surfaces
  now download the signed-release `AstraDownloader.exe` directly.
- **Transcript fallback sent a poison placeholder API key** (guaranteed 400)
  when page extraction failed; the Innertube method now fails over cleanly.
- The `@description` no longer advertises SponsorBlock (extension-only);
  companion health checks are single-flight like the extension.
- **theater-split.user.js** (v1.0.8) stands down when YTKit's built-in
  Theater Split is active instead of fighting it for the same gesture;
  **YT_Reaction_Spammer.user.js** (v0.3.1) gained update/download URLs (it
  could never auto-update), a corrected namespace, and a stand-down guard
  against YTKit's integrated spammer.

### UX, accessibility & theming
- **Toasts, panel search, and category headers are no longer suppressed for
  every install.** The maintainer's personal Stylebot rules in `early.css`
  hid the global toast (the product's only feedback/Undo surface), the
  settings panel's search box, and the per-category Enable-all switches for
  all users. They now live behind a new off-by-default "Compact Clean UI"
  preset (`cleanUiPreset`).
- **Light-theme support for in-page widgets:** the RYD pill, subscription
  toolbar/chips, transcript search button, and monetization pill were
  white-on-white on YouTube's light theme (≈1:1 contrast); each family now
  carries light-mode overrides.
- **Focus visibility:** the settings panel's generic `:focus-visible` ring
  computed to 1.26:1 — it now uses the strong focus-ring token; muted help
  text was bumped from 3.87:1 to ≥4.5:1 contrast.
- **Reduced motion** now covers the install-prompt/download-panel entrance
  animations and the What's New badge; **forced-colors (Windows High
  Contrast) CSS is always injected** instead of hiding behind a default-off
  toggle that high-contrast users couldn't comfortably reach.
- Feature-card preview tooltips show on keyboard focus and mirror into
  `aria-description`; the stats overlay drops the hacker-green styling and
  exposes `aria-pressed`; the popup search documents its `risk:`/`category:`
  mini-DSL in a visible hint instead of a hover-only tooltip; popup hit
  targets meet the 24 px minimum; `<html lang>` follows the chosen locale.
- **Microcopy:** the local companion is called "Astra Downloader" everywhere
  (was a mix of MediaDL / Local downloader / Companion); the clipboard
  failure message no longer tells users to open DevTools.

### Build & gates
- **Windows release ZIPs/XPIs are valid again:** PowerShell 5.1
  `Compress-Archive` wrote backslash entry paths (AMO rejects these and
  Linux unzip mangles them); packaging now uses the system bsdtar with
  forward-slash entries.
- **Ephemeral CRX signing actually works:** validation builds previously
  signed each profile with a different throwaway key and the advertised key
  cleanup was dead code; both profiles now share one generated key that is
  verifiably deleted after the build.
- Gate hardening: `check-no-eval` no longer skips lines where a URL precedes
  the match; `check-contrast` rejects non-hex colors instead of silently
  evaluating against black; `check-versions` fails on an empty `--tag`; a
  new parity test pins the two duplicated manifest `content_scripts` lists
  to each other.

## [4.46.2] - 2026-06-08

### Fixed
- **Downloads:** the Cobalt fallback and the folder picker sent empty request
  bodies (wrong payload field), so both silently failed; corrected.
- **SponsorBlock:** a fetch that resolved after navigating to a different video
  could paint the previous video's segment bars and auto-skip with the wrong
  timestamps; the result is now discarded on navigation.
- **Subscription Groups:** deferred refresh timers were not cleared on
  navigation, which could stamp "last visited" for unrelated channels on another
  page; timers are now tracked and cleared. "Shortest first" sort now compares
  `MM:SS` and `HH:MM:SS` runtimes on the same scale.
- **Transcript:** timestamps past one hour now render `1:02:40` instead of
  `62:40` (viewer and export).
- **Userscript:** the download companion is now discovered across its fallback
  ports (not just 9751) and validated by service identity; the CPU-saver
  teardown no longer risks leaving page timers throttled.

### Changed
- Popup error messages announce more assertively for screen readers, toggling a
  setting keeps keyboard focus on the row, the companion update buttons only show
  on the full profile, and storage sizes/counts use locale-aware formatting
  (GB/TB and grouping separators).

### Docs
- Added [INSTALL.md](INSTALL.md) with step-by-step install instructions for
  Chrome/Edge, Firefox, and the userscript.

## [4.46.1] - 2026-06-08

### Security & reliability
- **EXT_FETCH credential-redirect leak closed.** Requests carrying cookies or an
  `Authorization` header now use `redirect: 'manual'` and reject the
  opaqueredirect, so secrets can't be resent to a redirect hop before the
  allowlist check.
- **Predicate-sandbox ReDoS guard hardened** with nested-group detection and a
  200-char source cap (the flat heuristics missed `((ab)*)*`-style patterns).
- **Downloader: server-side YouTube-only allowlist on `/download`** (closes the
  SSRF + cookie-scope exposure that previously lived only in the extension),
  plus a stall watchdog that kills a wedged yt-dlp instead of leaking a worker.
- **Native-messaging token-bootstrap scaffolding** (framing + handler + manifest
  builder + argv gate, all unit-tested and gated) plus
  `docs/native-messaging-token-bootstrap.md`, toward replacing the HTTP
  `/health` token disclosure.

### Settings & correctness
- **Settings export/import no longer hard-fails** for users who customized
  `sidebarOrder`; nullable-complex settings accept their populated runtime shape.
- **Downgrade safety:** opening older code against newer data preserves the
  future schema stamp instead of re-arming forward migrations.
- **Schema range/enum constraints** (`min`/`max`/`enum`) with clamp/coerce on
  import, sanitizing corrupted/hostile values instead of rejecting the snapshot.
- **Compact view-count parsing corruption fixed** ("1,234 views" no longer reads
  as 1) and centralized in `core/text-metrics.js` with a regression guard.
- `rememberVolume` persists a muted/0 level; `chronologicalNotifications`
  re-sorts late-arriving items; `qualityProfileMatrix` timer/observer leaks
  fixed; the IndexedDB transcript index is now LRU-bounded.

### UX
- **Baked-in avatar / home-shelf hides are now opt-out** via the new "Restore
  Native YouTube UI" toggle (default off; zero FOUC by default).
- The popup Reset reports honestly when Undo is unavailable (older Firefox)
  instead of promising a non-existent Undo button.

### Tooling / CI
- Enabled the repository Dependency-graph prerequisite so the Dependency review
  check actually runs instead of erroring "not supported".
- CONTRIBUTING documents the Windows/UNC `npm run` (cmd.exe) limitation and
  workarounds.

- **Locale proofing CSV hardening.** `npm run i18n:proofing-export` now
  neutralizes formula-like CSV cells before escaping, so generated translator
  handoff files can be opened in spreadsheet tools without treating source text,
  current locale text, proposed translations, or notes as formulas.

- **Locale proofing export added.** `npm run i18n:proofing-export` now writes
  translator-ready per-locale CSV files plus `index.json` under ignored
  `build/i18n-proofing/`, carrying unresolved feature name/description
  placeholders with blank `proposed_translation` and `notes` columns for
  native-speaker review.

- **Locale proofing queue added.** `npm run i18n:coverage` now separates exact
  reviewed brand/technical matches from unresolved identical-to-EN
  placeholders, emits a per-locale feature name/description proofing queue with
  sample keys, and `npm run i18n:coverage:warn` warns if unresolved feature copy
  rises above the current 582-message baseline. `scripts/generate-locales.js`
  now shares the reviewed do-not-translate policy and preserves proofed feature
  overrides when rewriting locale files.

- **Release digest verifier added.** `npm run release:verify-digests` compares
  uploaded GitHub Release asset `sha256:` digests against local
  `build/SHA256SUMS`, including the checksum file's own digest, and fails on
  missing, extra, duplicate, or mismatched assets. The command supports live
  `gh release view` data and offline fixture JSON for tests.

- **Release readiness report added.** `npm run release:readiness` now generates
  machine-readable JSON and Markdown under `build/release-readiness/`, checking
  version sync, release-manifest and SHA256SUMS coverage, SBOM presence, root
  signing-key absence, expected artifact inventory, and companion EXE/sidecar
  truth. The Build & Release workflow runs it with `--require-pass` after
  `npm run release:manifest` and before artifact upload.

- **Branch-scoped CodeQL alert remediation expanded.** Exact YouTube hostname
  parsing now replaces URL substring checks in channel/share/navigation paths,
  Disable SPA Navigation rejects non-http(s) schemes, Resume Playback Position
  stores sanitized video IDs in a `Map`, Quick Links accepts only YouTube-owned
  destinations and rebuilds anchors from a fixed YouTube origin, Quick Links
  SVG/label rendering uses DOM-created nodes, the userscript no longer ships a
  local TrustedHTML parser helper, transcript XML parsing avoids
  double-unescaping, build version bumps avoid read races, popup/i18n audit
  helpers avoid flagged sanitizer patterns, and the folder picker returns a
  generic UI error while writing only a generic local failure marker. Hardening
  tests now pin the remediated shapes across extension, userscript, scripts,
  build, and companion code.

- **Selector fixture match matrix expanded.** `npm run build:fixtures` now emits
  DOM-subset match evidence for 15 capture-backed surfaces across the existing
  home, watch, and live-chat MHTML corpus, plus public Shorts, search-results,
  channel, and embed-player capture fixtures generated through the new
  `npm run capture:surface` profiles. The selector regression derives the
  expected capture list from the fixture builder, keeps stable/fallback arrays
  synced with live selector packs, and fails if any registered capture loses all
  stable selector matches or if a release-blocking required selector stops
  resolving. History, Watch Later, and the open notifications menu remain
  account/menu-state capture work.

- **Chromium optional-host prompt-readiness smoke added.** `npm run
  smoke:optional-hosts` stages the store-safe Chromium manifest, opens the real
  extension popup in a fresh Chromium-family profile, seeds enabled optional
  enrichment features, and verifies that the Grant access banner lists all five
  missing runtime optional origins before any grant is accepted. The smoke falls
  back to Edge when managed Google Chrome blocks `--load-extension`. Headed
  Chromium modes now also cover denied prompts and accepted-then-revoked grants:
  `--headed --expect-deny` requires the missing-grant banner and denial copy to
  remain visible, while `--headed --attempt-grant --revoke-after-grant` removes
  accepted origins through `chrome.permissions.remove()` and requires the popup
  to return to the permission-needed state. Firefox now has a headed manual
  prompt harness through `npm run smoke:firefox -- --headed
  --manual-optional-hosts`, which opens the staged popup at a stable
  `moz-extension://` URL and prints the optional-origin checklist for release
  operators.

- **Firefox MV3 release gate added.** `web-ext@10.3.0` is exact-pinned and
  `npm run check` now stages both store-safe and GitHub-full Firefox manifests
  for `web-ext lint --source-dir`, which passes with zero errors, warnings, or
  notices. The release workflow installs Firefox through a pinned
  `browser-actions/setup-firefox` action and runs `npm run smoke:firefox` after
  artifact generation, launching the store-safe staged manifest in a clean
  headless Firefox profile against a stable YouTube URL. AMO lint blockers found
  during the gate were fixed: manifest PNG icons are square, Firefox data
  consent now requires Firefox 142+, and remaining TrustedHTML writes avoid raw
  `innerHTML` sinks.

- **In-page overlay accessibility gate added.** `npm run check` now runs a new
  `npm run audit:overlays` static gate for runtime-generated overlays beyond
  the popup. The gate covers toast live-region semantics, downloader install /
  options / health / history surfaces, transcript viewer/search, video notes,
  and subscription group toolbar/digest/modal controls, with mutation canaries
  for unlabeled close buttons, missing `:focus-visible`, and sub-24px targets.
  Generated overlay controls gained missing region/dialog names, polite status
  labels, accessible action names, focus-visible rules, and explicit target
  size floors where needed.

- **Repo working notes reconciled.** `the project notes` now points first-read workers at
  tracked loop/planning/audit files, describes where to find protected-main and
  maintainer-local release policy, states that ignored `CLAUDE.md` is optional
  local scratch, and removes the committed dependency on stale local-only notes.

- **CodeQL PR alerts resolved.** CSP hardening tests now parse exact
  `connect-src` directive tokens instead of checking URL substrings, and the
  companion release staging script validates and reads the EXE from the same
  opened descriptor before writing it into `build/`. The hardening suite now
  pins both the exact-token CSP behavior and the no-race companion staging
  shape.

- **Astra Downloader companion setup docs clarified.** README now separates
  browser extension install from Astra Downloader companion setup, states that
  latest release `v4.46.0` does not include `AstraDownloader.exe` or its
  `.sha256` sidecar, documents the current source-checkout launch path, and
  frames PO-token/Deno setup as companion prerequisites. Release-checklist docs
  now require README/release notes to keep that caveat until both companion
  assets are attached.

- **GitHub Actions workflow refs pinned to full SHAs.** Validation, release,
  yt-dlp smoke, and CodeQL workflows now reference external actions by
  full-length commit SHA with same-line version comments. The dependency-review
  job now pins the existing upstream `v5.0.0` release instead of the nonexistent
  `v5` tag, and hardening tests reject mutable tag/branch action refs.
  `npm run policy:actions` now emits the selected-actions hosted policy payload
  from the workflow inventory, with GitHub-owned actions allowed, verified
  creators disabled, and only the pinned `browser-actions/setup-firefox` ref in
  `patterns_allowed`. The repository-level selected-actions and required-SHA
  policy switch remains a post-merge maintainer settings step.

- **Dependency review made advisory until hosted graph setup is proven.** The
  PR-only `Validate / Dependency review` job now uses repository variable
  `DEPENDENCY_REVIEW_REQUIRED` as its enforcement switch. With the variable
  unset, dependency PRs do not fail solely because dependency graph is not yet
  enabled; setting it to `true` after hosted proof restores the existing
  `fail-on-severity: moderate` gate.

- **Store-safe enrichment hosts moved to runtime optional grants.** Store-safe
  generated manifests now keep only core YouTube hosts required while declaring
  SponsorBlock/DeArrow, thumbnail, Return YouTube Dislike, and Reddit hosts in
  `optional_host_permissions`. The popup requests declared optional hosts
  before enabling matching settings and now shows a top-level **Grant access**
  banner when already-enabled features, including default-on SponsorBlock, need
  a runtime host grant. The background `EXT_FETCH` proxy checks the current
  runtime host grant before fetching optional origins. Denied or revoked grants
  surface as permission chips in quick toggles, schema rows, and the data-flow
  panel, with exact permission-denied status copy instead of a generic write
  failure. Hardening and background tests pin the manifest split, helper
  behavior, granted/denied proxy paths, and revoked-state UI.

- **CODEOWNERS source policy added.** `.github/CODEOWNERS` now maps
  security-sensitive repository policy, release/signing tooling, dependency
  manifests, hardening gates, extension core/manifest/background code, and the
  Python companion to `@SysAdminDoc`, with a hardening regression that keeps the
  high-risk path set covered. Enforcing code-owner review on `main` remains a
  post-merge repository-protection step.

- **Astra Downloader self-update release contract hardened.** Release tooling
  now has a `release:stage-companion` path for staging `AstraDownloader.exe`
  into `build/`, `release:manifest -- --require-companion` requires the EXE and
  generated `.sha256` sidecar, and the companion updater now fails clearly when
  the sidecar is unavailable instead of scheduling a hash-unverified update.
  The public release upload/dry-run remains a maintainer release step.

- **CodeQL code scanning baseline enabled.** Added an advanced CodeQL workflow
  for JavaScript/TypeScript extension code and the Python companion using the
  `security-extended` suite, least-privilege code-scanning upload permission,
  generated-output path exclusions, and a hardening regression that keeps the
  language matrix and query suite from drifting. The first hosted push and PR
  baselines both completed with zero open code-scanning alerts.

- **Security disclosure policy published.** Root `SECURITY.md` now defines
  supported versions, private vulnerability reporting, response windows,
  sensitive-data boundaries, and high-priority vulnerability classes. README,
  CONTRIBUTING, the signing-key leak runbook, and repository-settings docs now
  route sensitive reports through private reporting/advisory flow instead of
  public issues.

- **Retired options-page runtime copy removed.** The AI summary missing-key
  error now points users to Astra Deck settings via the YouTube gear icon or the
  toolbar popup's **Open Full Settings** action instead of referencing the
  removed standalone options page. A hardening regression now fails if shipped
  runtime code reintroduces the stale `via options page` guidance.

- **Release-doc contract reconciled.** The architecture map now describes the
  actual split between CI-built workflow artifacts with tag-only build/SBOM
  attestations and maintainer-local public release publication for `ytkit.pem`
  signed CRX assets.

- **GitHub Actions Node 24 migration.** Validation, release, and yt-dlp smoke
  workflows now use Node 24-ready GitHub-owned action majors:
  `checkout@v6`, `setup-node@v6`, `setup-python@v6`, and
  `upload-artifact@v7`. A hardening regression keeps the old Node 20-era
  action majors from returning before the later SHA-pinning pass.

- **CRX signing-key custody moved out of the worktree.** Release CRX builds now
  require an external maintainer key path (`ASTRA_CRX_KEY_PATH`, `--crx-key`,
  or `%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem`) and reject repo-worktree key
  paths. Validation builds use an explicit ephemeral CRX key mode that deletes
  generated key material before build exit, and the current self-distributed
  CRX ID is recorded in the signing policy.

- **Secret-scanning alert triaged and resolved.** The open Google API-key alert
  was resolved as a false positive after redacted triage confirmed the value was
  a public YouTube/Innertube bootstrap fallback, not a private provider
  credential. Active source and tracked archive snapshots no longer ship Google
  API-key-shaped literals; transcript Innertube requests now require a
  page-derived key and fall through to other transcript methods when unavailable.

- **Python companion dependency audit gate.** The `Validate` workflow now runs
  `pip-audit` against `astra_downloader/requirements.txt`, uploads a JSON audit
  artifact for release review, and runs GitHub dependency review on pull
  requests so moderate-or-higher vulnerable dependency changes fail before
  merge.

- **Cross-store privacy and Firefox consent packet.** Added
  `docs/privacy-policy.md` as the stable policy source linked from README and
  store-submission docs. The policy covers local storage, third-party API calls,
  local companion handoff, YouTube cookie use, BYO-key provider behavior,
  retention/export/delete controls, no telemetry/ads/sale, and the Chrome
  Limited Use statement. Firefox artifacts now require Firefox 142+ and declare
  built-in `data_collection_permissions` for browsing activity, website
  content, website activity, and authentication information.

- **GitHub Validate Python job restored.** The `Validate` workflow now installs
  the Linux Qt runtime packages needed by PyQt6, runs downloader tests with
  `QT_QPA_PLATFORM=offscreen`, installs the pytest plugins that own the repo's
  `pytest.ini` keys, disables downloader runtime bootstrap in CI, and runs a
  PyQt preflight that emits a clear workflow error before pytest if the runner
  is missing `libEGL` or xcb support libraries.

- **Liquid-glass watch-page capture unblocked.** Added
  `scripts/capture-watch-mhtml.js` and `npm run capture:watch`, which launches
  Chrome Stable with a temporary profile, waits for `ytd-watch-flexy`,
  `#movie_player`, and `.ytp-delhi-modern`, stops page loading, then captures
  `mhtml/WatchPage.mhtml` with CDP. The refreshed ignored capture regenerated
  `yt-watch.tokens.txt` and `selector-surface-matches.json`, proving
  `ytp-delhi-modern`, `ytp-overflow-panel`, and `ytp-time-wrapper-delhi` from a
  current watch page.

- **Return YouTube Dislike estimate disclosure.** Successful RYD renders now
  show a compact `est.` affordance next to the restored count, with tooltip and
  `aria-label` copy explaining that counts are estimates after YouTube removed
  public dislike totals and low-traffic videos can be less accurate. The
  userscript RYD path, ratio labels, locale seed descriptions, README, data-flow
  review copy, and hardening tests now carry the same disclosure.

- **Schema-validated settings backups.** Popup and in-page backup exports now
  emit a scrubbed `exportVersion: 4` JSON payload with settings-schema version,
  active profile, scrubbed-key, and profile-defaulted-key metadata. Import now
  migrates first, then rejects unknown, unsafe, or shape-mismatched settings
  before writing storage. `policy-profile.js` owns the shared schema validator
  and schema-only export mode, and userscript output is synced to the same
  contract.

- **Version-surface docs clarified.** Active documentation now names v4.46.0 as
  the current shipped product line across the five checked product-version
  sources and labels legacy v5/v6 roadmap references as internal planning-track
  names, not released extension/userscript versions.

- **Store-review permission rationale.** Added
  `docs/store-permission-rationale.md` as the copy-paste source for the Chrome
  Web Store / AMO single-purpose, data-handling, manifest-permission, and
  host-permission review fields. The CWS checklist now points to it, and a
  hardening test checks the doc against live manifest permissions plus generated
  store-safe/GitHub-full host grants.

- **yt-dlp cookie threat model.** Added
  `docs/yt-dlp-cookie-threat-model.md` documenting the CVE-2023-35934 /
  GHSA-v8mc-9377-rwjj redirect-cookie leak class, Astra's YouTube-only cookie
  bridge, per-download Netscape cookie jars, `--cookies` invocation, jar cleanup
  and stale sweep, exact `yt-dlp==2026.3.17` pin, and residual local-machine
  risk. The downloader test suite now pins the doc against live mitigation
  names.

- **Settings migration full-profile fixture.** Added a pinned
  `SETTINGS_VERSION` v1 full-profile settings blob covering every current
  default key, migration override, future-default classification, and retired
  setting. The migration round-trip suite now proves the 362-key schema is
  preserved, defaulted, overridden, or intentionally stripped during forward
  import, so accidental key drops fail deterministically.

- **Long-session leak regression.** Added `tests/long-session.test.js`, a
  deterministic DOM/timer/RAF/MutationObserver harness that simulates 1000
  route changes and mutation batches against the real navigation and diagnostic
  modules. The test pins one shared mutation observer, scoped-rule early exits,
  capped DiagnosticLog ring/counters, and listener/observer cleanup.

- **Cobalt fallback diagnostics.** When Astra Downloader is offline and the
  GitHub-full Cobalt fallback request fails, Astra Deck now writes an actionable
  `DiagnosticLog` entry under `cobalt-fallback`. The message records only the
  configured instance origin, explains that the local downloader was offline,
  and points users to `downloadCobaltInstance` or starting Astra Downloader.

- **Policy-profile scrub coverage.** The export scrubber now catches
  separator-aware API-key names (`api_key`, `api-key`), password/credential
  fields, private/access/refresh/session/signing key aliases, cookie snapshots,
  bearer/secret/token/auth-shaped keys, and unknown secret-shaped forward-compat
  settings before passthrough. Schema-derived hardening tests now prove every
  GitHub-full key is defaulted out of store-safe exports unless scrubbed, and
  every credential-shaped schema key is absent from both store-safe and
  GitHub-full export snapshots.

- **Storage-growth caps for notes, bookmarks, and watch history.** Added shared
  deterministic sanitizers for `ytkit-bookmarks`, `ytkit-watch-progress`, and
  `ytkit-watch-time`, then routed extension and userscript write paths through
  them before persistence. `storageQuotaLRU` now sweeps the real top-level
  stores plus `videoNotesData`, not the stale `timestampBookmarks` toggle.

- **Downloader request-field allowlist.** The Flask `/download` boundary now
  accepts only reviewed extension wire fields before Deno checks, cookie writes,
  queueing, or subprocess setup. Client-supplied yt-dlp argv / flag fields and
  unknown fields return explicit 400 responses, with API tests proving an
  unexpected `ytDlpArgs` payload is rejected before any download is queued.

- **Firefox programmatic-injection pre-flight.** Added
  `scripts/check-firefox-injection.js` to `npm run check` so future
  `scripting.executeScript`, `tabs.executeScript`, or dynamic content-script
  registration call sites under `extension/` fail until audited for Firefox
  149/152 `moz-extension://` behavior. The audit note records the current
  zero-call-site inventory and the official Mozilla / MDN source behavior.

- **Selector fixture match harness.** `npm run build:fixtures` now writes
  `tests/fixtures/selector-surface-matches.json` alongside the token fixtures.
  The builder parses decoded MHTML markup with a dependency-free DOM subset
  matcher, then records which `playerChrome` and `liveChat` selector-pack
  entries resolve. Selector regression tests now fail if the match report drifts
  from the current packs or if critical live-chat / liquid-glass selectors stop
  matching their captured fixture.

- **Monthly yt-dlp smoke gate.** Downloader requirements now exact-pin
  `yt-dlp==2026.3.17` and `curl_cffi==0.15.0` so Dependabot opens reviewed
  extractor-bump PRs. A new `yt-dlp-smoke.yml` workflow runs monthly or on
  `workflow_dispatch`, installs those pins, and uses `scripts/yt-dlp-smoke.py`
  to perform a bounded real media download against a stable public YouTube
  fixture before a bump can be trusted.

- **Store-safe / GitHub-full artifact split.** `build-extension.js` now emits
  profile-named Chrome and Firefox packages from the same extension source:
  store-safe artifacts strip AI, Cobalt, and local-loopback host grants/CSP,
  while GitHub-full artifacts retain the full data-flow catalogue including
  Cobalt. The packager also accepts `--profile store-safe|github-full|both`,
  and the background proxy allowlist now includes Cobalt so the full-profile
  fallback can reach its default API instance.

- **Feature-definition i18n.** The full in-page settings panel now resolves
  feature names and descriptions through generated `feature_<id>_name` /
  `feature_<id>_desc` locale keys before falling back to inline English.
  Runtime feature registry entries carry `nameKey` / `descriptionKey`, page
  quick-control cards share the same resolver, and all 10 locale bundles now
  seed the 306 feature-definition name/description pairs with existing
  quick-toggle translations reused where available.

- **Study / Work export.** The `researchSpacedReview` watch-page action now
  exports a Study / Work report as Markdown or CSV, combining Watch Time Tracker
  totals, current Digital Wellbeing day state, Focused Mode state, and timestamp
  bookmarks with deep links. The bookmark reader now handles the live
  `timestampBookmarks` `t`/`n` fields, and the shared file-export helper accepts
  per-format MIME types.

- **Group notifications digest.** Subscription Groups now has a toolbar Digest
  panel with all-subscriptions and per-group new-video counts based on rendered
  relative age text versus `subscriptionLastVisitData`. The panel supports
  nested group rows, View shortcuts, and bounded Mark read updates that reuse the
  2000-channel last-visit cap.

- **NF1 per-video notes.** Added the `videoNotes` watch-page panel with
  debounced local saves into `videoNotesData`, delete/undo for the current
  video, and a versioned JSON export (`astra-deck-video-notes-YYYY-MM-DD.json`).
  Notes are sanitized on read/write and capped to the 1000 most recently edited
  videos by `updatedAt`.

- **Dead-channel unsubscribe staging.** Subscription Groups now flags rendered
  subscription-feed cards whose newest visible upload is at least 365 days old,
  stores staged review records in `subscriptionUnsubscribeStagingData` with a
  30-day `undoUntil` window, and adds Scan Stale / Stage Stale / Undo Staged
  toolbar actions. The staging path marks cards for review only; it does not
  click YouTube unsubscribe controls.

- **NF2 nested subscription groups.** Subscription group records now support a
  depth-2 `parentId` shape, export as schema v2, and import via a two-pass
  normalizer that preserves valid parent links while rejecting child-of-child
  depth. Selecting a parent group includes channels from its child groups, the
  toolbar renders child chips with depth styling, and a `+ Subgroup` action is
  available only when a top-level group is active.

- **NF6 Astra Downloader companion self-update.** Added a protected `/update`
  endpoint that compares companion `APP_VERSION`, blocks while downloads are
  active, downloads the latest GitHub Release `AstraDownloader.exe`, validates
  the binary, schedules an after-exit atomic replace/restart, and reports
  structured current/update/error states. The popup now exposes an **Update
  Companion** action that routes through the active YouTube content script so
  the local auth token stays in the page bridge. The existing installer action
  now targets the GitHub Release executable instead of a missing raw-root file;
  `APP_VERSION` remains `1.5.1` until the next matching companion binary release
  is produced.

- **Next-2 peel: player dock and YouTube Music compatibility.** Added
  `features/player-dock/index.js` and
  `features/youtube-music-compat/index.js`, wired both into MV3 and userscript
  load order, and made `ytkit.js` prefer the module-owned
  `floatingLogoOnWatch` / `youtubeMusicCompat` runtime objects while retaining
  inline object fallbacks.

- **Top-3 peel: hideVideosFromHome runtime.** Added
  `features/video-hider/index.js` with `createHideVideosFromHomeFeature(deps)`,
  wired it into MV3 and userscript load order, and made `ytkit.js` prefer the
  module-owned Video Hider runtime while retaining the inline object fallback.

- **Top-3 peel: stickyVideo runtime.** `features/sticky-video/index.js` now
  exports `createStickyVideoFeature(deps)` and owns the primary Theater Split
  runtime/state object; `ytkit.js` prefers that factory and keeps its inline
  object only as a compatibility fallback.

- **Top-3 peel seed: stickyVideo styles.** Added
  `features/sticky-video/index.js` with the Theater Split shell/meta/comments
  style builders, wired the module into MV3 and userscript load order, and made
  the monolith prefer the module while keeping inline fallback CSS byte-pinned.

- **Top-3 peel: chatStyleComments runtime.** The Studio Comments module now owns
  comment normalization, reply-dialog styling, selection guarding, mutation
  scheduling, and teardown; `ytkit.js` instantiates that runtime and keeps the
  old inline observer path only as fallback.

- **Top-3 peel seed: chatStyleComments styles.** Added
  `features/chat-style-comments/index.js` with the Studio Comments style
  builders, wired the module into MV3 and userscript load order, and made the
  monolith prefer the module while keeping inline fallback CSS byte-pinned.

- **NF5 Wave 3 lifecycle CSS delegation.** CSS peel modules now register real
  style lifecycle specs through `core/styles.js#createCssLifecycleSpec`, and
  `cssFeature` delegates registered features to lifecycle start/destroy with
  direct injection kept only as fallback. The userscript bundle now includes
  `core/styles.js` so the same helper is available outside MV3.

- **Monolith catch-reason lint coverage.** `extension/ytkit.js` now runs the
  custom `require-catch-reason` ESLint rule. The remaining intentional silent
  catches in the monolith carry explicit `reason:` comments, and the lint
  script plus hardening tests pin the widened scope.

- **Core catch-reason lint coverage.** `npm run lint` now applies the
  custom `require-catch-reason` rule to direct `extension/core/*.js` modules,
  with the remaining intentional silent catches annotated and the stale
  no-await disable removed from the capability probe.

- **EI-NEW6 selector-health attribute drift.** Default selector shape samples
  now include hashed attribute-name and class-list signatures, and
  selector-health summaries, rankings, and copy reports surface shape drift even
  when selectors still hit.

- **EI-NEW5 video hider channel-key cache.** Blocked-channel records now keep
  a precomputed identity-key `Set`, so per-card feed filtering checks direct
  key membership instead of rescanning every blocked channel record.

- **EI-NEW1 chatStyleComments selector fallback.** The reply-dialog
  `:has()` rule is now explicitly fenced with `@supports selector(:has(*))`,
  with a no-`:has()` fallback that uses the existing `.ytkit-replying` class to
  keep active reply composers visible while hiding closed dialog shells.

- **NF31 subscription group sort persistence.** Subscription sort mode now
  persists on the active group record, so Coding, Music, News, and the
  all-subscriptions view can each keep their own sort. The legacy
  `subscriptionSortMode` setting remains as the all-feed fallback, and imports
  normalize stale or missing group sort values.

- **NF32 stickyVideo chat observer lifecycle.** Theater Split now uses one
  `_chatObserver` + `_chatObserverTimer` path for both split-open chat
  positioning and standard-page late-chat reclassification. `_unmount()` and
  `destroy()` both route through `_stopChatObserver()`, preventing the previous
  duplicate watcher state from drifting across SPA navigation.

- **EI8 live-chat selector fixture refresh.** Captured a fresh popout
  live-chat MHTML from active video `c5iz06NyjIE`, added the committed
  `yt-live-chat.tokens.txt` canary, and marked the three live-chat selector
  packs verified on 2026-06-04. The watch-page wrapper selectors
  (`ytd-live-chat-frame#chat`, `iframe#chatframe`) were verified by rendered
  DOM probe because full watch-page MHTML snapshots time out under headless
  Chrome.

- **H21 liquid-glass selector canaries.** A 2026-06-04 headful Chrome DOM probe
  confirmed YouTube's current player root uses `ytp-delhi-modern`, with
  `ytp-overflow-panel` and `ytp-time-wrapper-delhi` present in the live DOM.
  Those three selectors are now release-blocking canaries. Follow-up work added
  the stopped-loading Chrome Stable MHTML capture helper and refreshed the
  committed watch fixture from the new chrome.

- **Deep audit hardening pass (H26).** Repo-wide principal-engineer audit
  across every surface — service worker, popup, core modules, the `ytkit.js`
  content script, the userscripts, and the Python downloader — verified
  adversarially before applying. 23 real fixes landed; 8 candidate findings
  were rejected as intentional design / false positives. 574 JS + 111 Python
  tests stay green; `npm run check` and the four-artifact build pass.
  - **High:** Reset now aborts (instead of silently wiping with no Undo) when
    the recovery snapshot can't be staged because storage exceeds the
    `storage.session` quota — while still allowing the intentional no-undo path
    on browsers without session storage. The predicate-sandbox / videoHider /
    commentFilter ReDoS guards now reject overlapping-alternation patterns
    (`(a|a|a)+`, `(a|aa)+`) that previously slipped past and could freeze the
    content-script main thread. The Python downloader now terminates in-flight
    `yt-dlp`/`ffmpeg` subprocesses on quit instead of orphaning them.
  - **Medium:** `EXT_FETCH` now keeps its timeout armed through the body-drain
    phase (a slow-trickle upstream could previously pin the service worker);
    Reset no longer re-triggers the first-run welcome card; the schema-overview
    no longer tears down a focused inline editor on an unrelated storage write;
    the XML transcript fallback now captures segment `dur`; the folder picker
    warns up-front when a chosen path is outside the allowed download roots;
    the first-run SetupWorker thread is awaited at shutdown; and the Windows
    process-tree kill reaps `ffmpeg` children even when `yt-dlp` exits fast.
  - **Low:** astral-plane HTML entities in transcripts, the captionTracks
    fallback regex truncating on `]`/`}` in a track name, a storage-preload
    clobber race, a shared-mutable cached `URLSearchParams`, a side-effecting
    `api-limiter.getState()`, a selector-health snapshot that mutated its own
    telemetry, an unbounded `error_lines` list, an unlocked `Config` across
    threads, `/pick-folder` rate-limiting/single-flight, a latent
    `commentTextSelectionSupport` teardown gap, a focus-trap visibility gap, a
    duplicate native search-clear button, and a dead capability-probe branch.

- **Planning docs consolidated.** Active backlog items now live at the top of
  `ROADMAP.md`, shipped roadmap arcs are summarized in `COMPLETED.md`, and
  research context is summarized in `RESEARCH_REPORT.md`. The previous
  root-level feature-plan files are archived under `docs/archive/research/`.

- **Premium-polish pass on the first-run + update surfaces.** Three
  small but real quality improvements to features from this arc:
  - **Welcome card: Store-Safe is now visibly the recommended
    default.** The two profile-picker buttons used to look identical
    despite representing very different choices (one ships on
    extension stores; the other unlocks the download companion,
    Cobalt fallback, custom CSS, BYO AI keys). The Store-Safe button
    now carries a small green `Recommended` pill in the top-right
    + a stronger accent border + brighter hover. The GitHub-Full
    button keeps a quieter palette so the contrast reads as
    intentional design rather than accidental drift. Both buttons
    remain keyboard-focusable with the same outline; the
    `aria-describedby` link from the safe button to the pill lets
    a screen reader voice "Store-Safe, Recommended" as the focus
    target.
  - **Microcopy normalization on the NF18 + NF21 dynamic status
    strings.** The previous strings mixed three formats:
    `"yt-dlp is already at v${after}."` (full sentence),
    `"yt-dlp updated v${before} → v${after}."` (arrow + period),
    `"Astra Deck updated from v${lastSeen} to v${manifestVersion}.
    See what changed."` (brand-prefixed). The `→` character
    translates poorly and screen readers either skip it or
    announce "right arrow" inconsistently. Polished forms:
    `yt-dlp already at v${after}` (no terminal period — outcome
    state, not a sentence); `yt-dlp updated to v${after} (from
    v${before})` (parenthetical for the prior version, easier to
    parse than an arrow); `Updated to v${manifestVersion} (from
    v${lastSeen}). See what changed.` (brand name removed — the
    popup header already carries it; redundant). All three were
    also incorrectly routed through `t(key, fallback)`, whose
    helper does NOT interpolate placeholders — so a translation
    key would have erased the version delta in any localized
    build. Dynamic-content strings now render directly with a
    comment explaining the deliberate t()-bypass, with the static
    label-only strings still going through t().
  - **Hardening test slice for the welcome-card flow extended.**
    The existing NF21 hardening test continues to pin the HTML
    element IDs + storage keys + boot wiring + mutual-exclusion
    gate; the polish pass adds no new tests but verifies the
    existing 574-JS-test suite still passes. `npm run check`
    clean (lint + syntax + version parity + schema + no-eval +
    a11y + contrast + audit:deps).

- **Quick Links menu caps at 10 slots.**
  Closes the P3/S backlog item. The launcher's add-form previously
  had no cap, so a stored `quickLinkItems` setting with 50 entries
  could overflow the dropdown. The fix introduces
  `_QL_MAX_ITEMS: 10` on the feature object:
  - **`_parseItems`** truncates the rendered list at the cap and
    slices defensively (`items.slice(0, this._QL_MAX_ITEMS)`).
    Excess entries are intentionally left in `quickLinkItems` so a
    future cap-bump can re-expose them without data loss.
  - **`validateForm`** computes the current count + `atCap` boolean
    on every input event and (a) disables the Add button when at
    cap, (b) surfaces `Limit reached (N/MAX). Remove an entry above
    to add a new one.` when at cap, (c) shows `(N/MAX used)` in
    the normal hint so the user always sees the budget. Re-evaluated
    on every keystroke so a delete-then-add flow re-enables
    cleanly.
  - **`addBtn.onclick`** has a defensive re-check at click time:
    rapid double-clicks that both passed `validateForm` before
    either persisted can no longer slip past the cap. The race
    path surfaces a toast pointing the user at the
    remove-to-add workflow.
  Pinned by a new `v4.47.0 — Quick Links menu caps at 10 slots`
  hardening test asserting the constant value, the `_parseItems`
  truncate, the `validateForm` cap-gate + status copy, and the
  defensive click-time re-check + toast. 574/574 JS tests pass
  (+1 new); npm run check clean. Backlog item retired from the
  consolidated roadmap.

- **PyQt6 GUI smoke tests for the downloader (NF22).** Previously the
  GUI side had only source-shape pins (FolderPickerWatchdogTests) —
  a regression in the dialog code-path would only surface via the
  user reports the watchdog was supposed to make easier to file. This
  adds a live `GuiSmokeTests` class that constructs a real
  `QApplication` and exercises the `FolderPickerService` timer-driven
  dispatch end-to-end. Six new tests:
  - `test_qapplication_constructs` — proves the QApplication
    singleton can be instantiated. Tests gracefully skip if Qt is
    unavailable (CI runner without a display server).
  - `test_folder_picker_service_constructs_and_starts_timer` — the
    QTimer that drives the dispatch loop is active and runs at the
    documented 150 ms cadence.
  - `test_folder_picker_tick_no_pending_request_is_noop` — empty
    queue must not raise.
  - `test_folder_picker_tick_returns_accepted_path` — mocks
    `QFileDialog.exec()` → `Accepted` + `selectedFiles()`,
    verifies the response queue carries the chosen path.
  - `test_folder_picker_tick_returns_cancelled_on_reject` — same
    path, `Rejected`, asserts `cancelled=True`.
  - `test_folder_picker_watchdog_fires_when_dialog_blocks_past_threshold`
    — uses `time.time()` mocking to simulate a `threshold + 5 s`
    dialog block; verifies the watchdog log line shape (NF35
    invariant). No new dependency added — pytest-qt was scoped in
    the backlog item but a hand-rolled `_get_qapp_or_skip` helper
    avoids the install-time cost while preserving CI-portable
    skip-on-no-display semantics. 111/111 Python tests pass
    (+6 new); 573/573 JS tests still pass.

- **On-demand yt-dlp self-update (NF18): `/update-ytdlp` endpoint +
  popup button.** When YouTube breaks the current yt-dlp build, the
  user previously had to wait up to 24 h for the auto-update throttle
  (NF26) or manually replace the binary. This adds a force-update
  path end-to-end:
  - **Server**: new `POST /update-ytdlp` route on the Astra
    Downloader. Gates: `401` without the per-install token; `503`
    when `yt-dlp.exe` is not present; `409` when
    `dl_manager.active_count() > 0` (the error message explains the
    atomic-replace race documented in NF26 so the user understands
    the gate); `200` with `ok:true` on a successful self-update,
    carrying `version_before -> version_after`; `500` with
    `ok:false` on non-zero exit / subprocess timeout. The subprocess
    runner was extracted into a shared `_run_ytdlp_self_update`
    helper so the manual endpoint and the background auto-update
    path (`maybe_auto_update_ytdlp`) emit identical persistent-log
    lines + invalidate the version cache + stamp the throttle marker
    on success.
  - **Content script**: new `MediaDLManager.updateYtdlp()` method
    runs a fresh `/health` probe to refresh the token + locate the
    correct port (yt-dlp self-update doesn't change either, but a
    cached token from 30 s ago may have rotated), then POSTs to
    `/update-ytdlp` with a 130 s timeout (server caps its own
    subprocess at 120 s, +10 s buffer for the round trip).
  - **Popup**: new "Update yt-dlp" button alongside the existing
    Reset / Enable Downloader Prompts row. Always-visible (yt-dlp
    breakage is unannounced so a deferred / dismissed surface
    wouldn't help). Click finds any active YouTube tab and sends a
    new `YTKIT_UPDATE_YTDLP` message; the content-script handler
    routes to `MediaDLManager.updateYtdlp()` and returns the
    structured response. Status string maps the server response
    verbatim: `yt-dlp updated v2026.04.01 → v2026.05.10` on success,
    `yt-dlp update failed: <stderr>` on failure, or "Open a YouTube
    tab first" when no tab is loaded. Button is disabled in-flight
    so a rapid second click can't fire a second update while the
    server is mid-replace.
  Pinned by a new `v4.47.0 NF18` hardening test asserting the
  content-script method (POST + token forwarding + 130 s timeout),
  the YTKIT_UPDATE_YTDLP listener (async return-true semantics),
  the popup button (always-visible, not hidden), the popup handler
  (YouTube-tab routing + version-delta status), and the server route
  (POST registration, shared runner, 409 gate with the
  atomically-replaces explanation). Six new Python tests cover the
  endpoint (401 reject, 503 when missing, 409 with the in-flight
  count, 200 with the version delta on success, 500 with stderr on
  non-zero exit, 500 with timeout-message on subprocess timeout,
  plus a shape pin on the shared runner). 573/573 JS + 105/105
  Python tests pass.

- **Wheel-seek on the progress bar (NF9).** Scroll the mouse wheel
  over the YouTube progress bar to seek forward/backward by
  `wheelSeekStepSec` seconds (default 5 — matches YouTube's
  native arrow-key seek step). Hooks `wheel` events on
  `.ytp-progress-bar-container, .ytp-progress-bar` with
  `capture: true` + `passive: false` and calls
  `e.stopImmediatePropagation()` so the existing `volumeWheelMode`
  listener at the `.html5-video-player` root never co-fires —
  scrolling over the bar seeks, scrolling anywhere else over the
  player still drives Volume Wheel. HUD chip (`.ytkit-seek-hud`)
  surfaces the new playback position + direction arrow for 1.2 s
  using the same palette as the volume HUD so the two features
  feel like siblings. Defensive bounds:
  - `wheelSeekStepSec` is clamped at the call site to
    `(0 < x ≤ 300)` so a corrupted import can't seek by 1e9 s
    per tick.
  - Live streams (`video.duration === Infinity`) fall back to
    `Number.MAX_SAFE_INTEGER` as the upper bound so
    `currentTime` never becomes `NaN` / `Infinity`.
  - Per-navigation re-attach via the existing `addNavigateRule`
    hook handles YouTube's SPA re-renders that destroy + recreate
    the progress bar element.
  Two new settings: `wheelSeek: false` (master toggle, default
  off, store-safe profile) + `wheelSeekStepSec: 5` (step size).
  No keyboard shortcut added (house style). Schema-count pin
  bumped 357 → 359; storage-size baseline +39 bytes. Pinned by
  a new `v4.47.0 NF9 — wheelSeek` hardening test asserting the
  progress-bar selector, the capture+passive:false registration,
  `stopImmediatePropagation` (prevents volumeWheelMode co-fire),
  `preventDefault` (suppresses page scroll), the step clamp,
  the live-stream Infinity guard, both schema entries, and
  the regenerated `default-settings.json` entries. 572/572 JS
  tests pass (+1 new).

- **CHANGELOG rotation (NEW-8): v3.33.0 and earlier moved to
  `CHANGELOG-v3-archive.md`.** Active CHANGELOG.md was approaching
  6000 lines and getting hard to scan in browser-rendered Markdown
  viewers. Split point is the major-version boundary at v3.33.0 —
  the v4.0.0 "Beats Every Competitor" milestone stays in the active
  file as the historical anchor. Archive carries the full v3.x
  hardening-pass history, the v3.21.0 i18n foundation, the iter-N
  research-loop pre-cursor work, and the original YouTube-Kit-era
  entries before the Astra Deck rebrand. Active file gains a
  footer pointer so a reader can find older entries without
  grepping the repo. Pinned by a new `v4.47.0 NEW-8 — CHANGELOG
  rotation` hardening test asserting (a) active file carries no
  v0/v1/v2/v3 release headings, (b) archive exists and starts at
  v3.33.0, (c) archive carries no v4.x headings, (d) active file
  links to the archive. Active CHANGELOG dropped from 6051 → 3686
  lines (-39%). 571/571 JS tests pass (+1 new).

- **Inline "local only" trust signal on credential-bearing schema-overview
  rows.** The privacy data-flow panel (v4.12.0) explained the
  storage-locality guarantee, but it ships off-by-default — a user
  pasting a BYO API key into the schema-overview editor had no visible
  reassurance about where the key lives. A small green `.so-key-trust-local`
  chip now surfaces on the `aiSummaryApiKey` + `aiSummaryEndpoint` rows
  (the AI endpoint URL can embed a key as a query param, so it gets the
  same treatment). Tooltip enumerates the guarantees:
  `chrome.storage.local` is origin-scoped and never synced to a Google
  account, never sent to Astra Deck servers, and the value is redacted
  from the bug-report bundle (Diagnostics → Save) via
  `BUG_REPORT_REDACTED_KEYS`. New `TRUST_SIGNAL_LOCAL_ONLY_KEYS` is a
  strict subset of `BUG_REPORT_REDACTED_KEYS` so the chip's "redacted
  from bundle" claim stays true; pinned at test time so adding a key
  to one set without the other fails CI. Public default URLs (Cobalt
  instance, alternative frontend, custom CSS) are redacted from
  bundles but don't get the chip — the "local only" reassurance is
  specifically about secrets. CSS adds the green-tone variant to the
  existing `.so-key-profile-badge` pattern (matches the v4.16.0 risk-
  badge palette: amber for gated, red for unavailable, green for
  trusted). Pinned by a new `v4.47.0 — schema-overview rows for
  credential-bearing keys carry an inline "local only" trust signal`
  hardening test asserting the set declaration, the subset relationship
  with BUG_REPORT_REDACTED_KEYS, the well-known BYO-key entries, the
  row-builder hook, and the CSS variant. Existing NEW-1 test anchor
  hardened from `indexOf('BUG_REPORT_REDACTED_KEYS')` to a regex
  search so future comments referencing the symbol can't fool the
  slice window. 570/570 JS tests pass (+1 new).

- **Audit pass: three real bugs fixed in the just-shipped Pass-3 batch.**
  Deep audit of recent changes caught two real
  defects + one polish gap before they reached users:
  - **NF21 upgrade regression — existing users were going to see
    the welcome card on every popup open after upgrading.** The
    first-run detection was `firstRunSeen = items[FIRST_RUN_SEEN_KEY] === true`,
    and the sentinel only exists in builds that ship NF21 — every
    pre-NF21 user had `firstRunSeen=false` after upgrading. Fix:
    `renderFirstRunSurfaces` now also reads `SETTINGS_STORAGE_KEY`,
    detects "at least one non-internal key" (anything not starting
    with `_`) as the upgrade signal, and silently stamps both
    `FIRST_RUN_SEEN_KEY=true` and `LAST_SEEN_VERSION_KEY=<current>`
    so neither surface fires for the upgraded user. They experience
    the popup as they always have, and the What's New banner fires
    correctly on their *next* version bump.
  - **NEW-7 read-modify-write race on `chrome.storage.session`.**
    Concurrent `_recordSwLifecycle` calls (e.g. `sw-start` firing
    alongside an immediate `reveal-failed` for a download that was
    in flight when the SW restarted) could lose entries via
    interleaved `get` → `set` sequences. The SW is single-threaded
    JS but the `await` between get and set creates the window.
    Fix: serialize lifecycle writes through a new `_swLifecycleChain`
    promise (same pattern popup.js uses for `_pendingWriteChain`).
    Catch-rethrow-undefined keeps the chain alive across rejections.
    `_recordSwLifecycle` is now a sync entry that schedules onto
    the chain; the async work happens inside the chained `.then`.
  - **Welcome profile pick double-click defense.** On a fresh
    install a rapid double-tap on the Store-Safe / GitHub-Full
    button could fire two writeSetting + storageSet pairs in
    flight. New `_welcomePickInFlight` guard disables both
    profile buttons + the dismiss link for the duration of the
    pick; on success the welcome card hides and the guards
    release naturally with the surface; on failure the buttons
    re-enable so the user can retry.
  Test updates: existing NF21 hardening test extended with a 6b
  block asserting the upgrade guard (reads SETTINGS_STORAGE_KEY,
  computes `looksLikeExistingInstall`, excludes `_`-prefixed
  keys, stamps the sentinel); existing NEW-7 test relaxed to
  accept the now-sync `_recordSwLifecycle` signature and gains a
  new pin on `let _swLifecycleChain = Promise.resolve()` so a
  future refactor can't quietly drop the serialization. 569/569
  JS tests pass; `npm run check` clean.

- **chrome.downloads.show reveal failures now log + record into the
  SW lifecycle ring (R3, Pass 3).** `chrome.downloads.show` is
  fire-and-forget; if the reveal failed (file moved between download
  completion and the reveal call, user revoked downloads access on
  Firefox, removable volume detached) the only signal the maintainer
  used to get from a user report was "nothing happened" — the catch
  was a silent `catch (_)` swallow. The handler now (a) console.warn's
  with the `[Astra Deck]` prefix + the download id + the error so
  support traces see the context, and (b) drops a
  `reveal-failed:<msg>` entry into the SW lifecycle ring (NEW-7) so
  the bug-report bundle surfaces it without any new telemetry. No
  user-facing toast — the failure is rare enough that an explicit
  banner would be more noise than signal, and the bundle path is
  already wired through the diagnostics flow. Pinned by a new
  `v4.47.0 R3` hardening test asserting the binding capture (was
  `catch (_)`, now `catch (err)`), the prefixed console.warn shape,
  and the reveal-failed lifecycle drop. 569/569 JS tests pass
  (+1 new).

- **feature_request issue template asks for the risk profile + competitive
  parity reference (EXIST-8, Pass 3).** Feature requests previously
  didn't tell triagers what profile to assign. The schema's `risk:` +
  `profile:` fields gate what ships to the Chrome/Firefox stores vs
  the GitHub-Full build, so a new request that quietly assumed
  store-safe behavior could collide with store-review policy. The
  template now carries a checkbox list mapping directly to the
  schema's risk taxonomy (safe / api / local-companion / experimental
  / store-risk + byo-key as a shorthand for "github-full + API key
  required") plus a competitive-parity prompt that points back at
  the competitor table in `ROADMAP.md` § Phase 1. Branding also
  updated YTKit → Astra Deck. Pinned by a new `v4.47.0 EXIST-8`
  hardening test asserting the rebrand, the risk-profile section,
  every risk band as a checkbox option, and the competitive-parity
  prompt. 568/568 JS tests pass (+1 new).

- **Service-worker lifecycle ring (NEW-7).**
  MV3 service workers restart unpredictably — ~30 s idle kill,
  suspension on memory pressure, post-install restarts. Several
  Astra Deck bugs surfaced only because the maintainer happened to
  hit a SW restart in dev (H25's cap-bypass-on-hydration is the
  most recent example). This ring records SW boot events into
  `chrome.storage.session` so the bug-report bundle (NEW-1) can
  surface "how often did the SW restart in this browsing session?"
  without depending on telemetry. Implementation:
  - `SW_LIFECYCLE_KEY = '_swLifecycle'` + `SW_LIFECYCLE_CAP = 50`
    (head-trim on overflow) in `extension/background.js`.
  - `_recordSwLifecycle(event)` awaits `_pendingRevealsReady`
    before snapshotting `_pendingReveals.size` so the recorded
    `inFlightReveals` count reflects the persisted state, not
    just the freshly-restarted SW's empty in-memory Set.
  - Module body fires `_recordSwLifecycle('sw-start')` at SW boot
    — every fresh SW process invocation hits that line, which is
    the signal that distinguishes "SW restarted between user
    actions" from "SW was alive across the user's whole session."
  - New `GET_SW_LIFECYCLE` message handler returns the ring to
    the popup as `{ entries, error }`, gated through the existing
    sender validation in the onMessage listener.
  - The popup's bug-report bundle (NEW-1) now sends
    `GET_SW_LIFECYCLE` before assembling the payload, includes
    the result as `swLifecycle`, and tolerates a null response
    (older SW build without the handler) by shipping the bundle
    without it. Bundle `schemaVersion` bumped 1 → 2 to reflect
    the shape addition; the bug-report consumer tooling keys
    schema migrations on this field.
  Pinned by a new `v4.47.0 NEW-7 — SW lifecycle ring` hardening
  test asserting the storage key + cap constants, the record
  helper (hydration wait + size capture + head-trim), the
  sw-start boot call, the message handler shape (storage read +
  response shape + return-true async path), and the popup
  consumer wiring (swLifecycle null-fallback + payload field).
  Existing NEW-1 test updated to tolerate `schemaVersion: [12]`.
  567/567 JS tests pass (+1 new).

- **Per-key Reset affordance on schema-overview rows (NEW-6).**
  A user who set one feature to a breaking value (e.g. pasted CSS
  into `customCssCode` that broke rendering, or set `vvfBrightness`
  to 0 making the page invisible) previously had to either remember
  the schema default or hit global Reset — which nukes every other
  setting too. The schema overview now renders a compact `↺` button
  at the end of every row whose current value differs from the
  schema-declared `defaultValue`. Click calls the same
  `writeSetting(key, defaultValue)` choke point every other inline
  editor uses, surfaces a confirmation status (`<key> reset to
  default.`), and re-renders the overview so the (now-default) row
  drops its reset button. Two helpers underpin the gate:
  - `isDefaultValue(currentValue, defaultValue)` — short-circuits
    on `===` for booleans / numbers / strings; falls through to
    `JSON.stringify` deep-compare for arrays + objects (cheap +
    correct for the small payloads the schema overview deals
    with; the heaviest is `hiddenChatElements` at ~10 short
    strings). `null` / `undefined` treated as equivalent so an
    unset storage slot doesn't surface a spurious reset button.
  - `describeDefaultForTooltip(value)` — pretty-prints the default
    in the button's tooltip (`Reset <key> to default (<value>)`)
    and truncates anything over 48 chars so the tooltip stays
    readable.
  CSS adds `.so-key-reset-btn` — square 6px radius (house style:
  no pill backdrops), amber hover accent matching the existing
  schema-overview gating chips, disabled-state dimming while a
  write is in flight. Pinned by a new `v4.47.0 NEW-6 — per-key
  Reset button` hardening test asserting the gate (defaultValue
  + isDefaultValue check), the click handler (writeSetting +
  re-render), the helpers (strict-equality short-circuit + JSON
  deep-compare + 48-char truncation), and the CSS rules. 566/566
  JS tests pass (+1 new).

- **First-run welcome card + profile picker + What's New banner (NF21).**
  Opening the popup on a fresh install used to dump the full 354-key
  editor with no guidance. This adds two mutually-exclusive surfaces:
  - **Welcome card.** Rendered when the `ytkit_first_run_seen`
    sentinel is absent from `chrome.storage.local`. Carries a short
    intro plus two profile picker buttons (Store-Safe / GitHub-Full)
    and a "Skip" dismiss. Picking a profile writes
    `githubFullProfile` (true for GitHub-Full, explicit false for
    Store-Safe — recording the user's choice matters for the popup
    overview's profile-gating badges + future export round-trips)
    via the existing `writeSetting` choke point, sets the sentinel,
    stamps `ytkit_last_seen_version` so the very next open doesn't
    fire a What's New banner against a user who just walked through
    welcome, and surfaces an undo-toast-style status message
    confirming the choice. No confirmation dialog (house style
    bans them).
  - **What's New banner.** Renders when the sentinel is present
    AND `ytkit_last_seen_version` differs from the current
    `manifestVersion`. Two buttons: "Read changelog" opens
    `https://github.com/SysAdminDoc/Astra-Deck/blob/main/CHANGELOG.md`
    in a new tab via `chrome.tabs.create` (falls back to
    `window.open` with `noopener,noreferrer`); "Dismiss" just stamps
    the seen-version. Either path dismisses the banner. Links to
    the top of the file because anchor stability across CHANGELOG
    rewrites is not guaranteed (NEW-8 in the Pass-3 research
    proposes annual rotation).
  Both surfaces ship `hidden` by default in the markup; the
  `renderFirstRunSurfaces` boot helper (called as a `void` Promise
  from the bootstrap IIFE, in parallel with the rest of init)
  reveals whichever applies. Dedicated storage keys
  (`ytkit_first_run_seen`, `ytkit_last_seen_version`) live outside
  `SETTINGS_STORAGE_KEY` so settings export/import + Reset don't
  clobber the first-run state. The CSS uses the existing amber
  accent palette (matching the schema-overview profile-gating
  chip from v4.39.0) so the relationship reads visually. WCAG
  contrast audit passes against the new surfaces. Pinned by a new
  `v4.47.0 NF21 — first-run welcome card + What's New banner`
  hardening test that asserts the HTML element ids + hidden-by-
  default, the storage-key + URL constants, the boot wiring, the
  mutual-exclusion gate, the profile-pick writes, the dismiss
  persistence, and the CSS declarations. 565/565 JS tests pass
  (+1 new); `npm run check` clean.

- **Userscript drift health check (NEW-2, Pass 3).**
  Three top-level userscripts exist in the repo — `YTKit.user.js`
  (auto-synced by `build-extension.js`), `theater-split.user.js` and
  `YT_Reaction_Spammer.user.js` (both hand-maintained). The hand-
  maintained pair could drift silently against YouTube DOM changes
  and metadata-block conventions; the Pass-3 audit caught one such
  drift (the `theater-split.user.js` fullscreen-overlay-stash bug
  had been latent because no test covered the live-video fullscreen
  path). New test file `tests/userscript-health.test.js` pins, for
  each standalone userscript:
  - Metadata block well-formedness (`==UserScript==` to
    `==/UserScript==`, required keys `@name`, `@version`, `@match`,
    `@run-at`, `@grant`).
  - `@match` / `@exclude` scope matches declared role: general-
    purpose scripts must exclude `m.youtube.com` and
    `studio.youtube.com`; the live-chat-only reaction spammer must
    `@match` only `/live_chat` routes.
  - Header `@version` matches the version suffix embedded in
    `@name` when present (closes the v1.0.5/v1.0.6 silent-drift
    class CLAUDE.md flagged 2026-04-24 — Tampermonkey keys some
    update-check paths on `@name` and a desynced bump never
    lands).
  - `@version` is a clean `x.y.z` semver triple.
  - `@namespace` / `@updateURL` / `@downloadURL` (when present)
    point at a `SysAdminDoc/*` repo so a fork can't hijack auto-
    updates.
  Plus two regression pins:
  - `theater-split.user.js` retains the Pass-3 `fullscreenStash`
    + `enterFullscreenStash` + `exitFullscreenStash` helpers,
    including the `document.body.appendChild(player)` move-out and
    the `visibility:hidden !important` overlay hide.
  - `YT_Reaction_Spammer.user.js` retains the v0.3.0 N3 safety
    floor `MIN_INTERVAL_MS = 500` (faster spam rates risk YouTube's
    automated-behavior heuristics).
  14 new tests; 564/564 JS tests pass.

- **Bug-report bundle: diagnostic save expanded into a self-identifying
  bundle with sanitized settings + capability map (NEW-1, Pass 3).**
  The existing healthSave button used to write a JSON file containing
  only the extension version, user agent, and `_errors` ring buffer —
  not enough context for an issue triager to diagnose most bugs. The
  bundle now carries:
  `{ astraDeckBugReport: true, schemaVersion: 1, exportedAt,
     extensionVersion, userAgent, capabilities, settings, errors }`
  where `capabilities` is the cached `capabilityProbe.runAll()` result
  (summarizerApi / mediaDL / ollama presence) and `settings` is the
  full settings snapshot with five sensitive fields redacted via
  `redactBugReportSettings()`:
  `aiSummaryApiKey`, `aiSummaryEndpoint`, `customCssCode`,
  `downloadCobaltInstance`, `alternativeFrontendInstance`. Each
  redacted value becomes `[redacted — N chars]` so triagers can still
  tell that the field was set (signal: "user had a key configured")
  without leaking the content. The `_errors` ring is dropped out of
  the sanitized settings object because it ships separately in the
  `errors` field — avoids double-shipping. The `astraDeckBugReport`
  marker key lets the issue template + future tooling identify the
  payload at a glance. Bug report issue template updated to reference
  the bundle by name + filename pattern and to skip the manual
  environment fields when the bundle is attached. Pinned by a new
  `v4.47.0 NEW-1 — bug-report bundle redacts BYO keys/endpoints/CSS`
  hardening test asserting the redaction list, the redaction helper
  shape (`[redacted — N chars]` placeholder + skip-empty guard), the
  payload marker + schema version + capability/settings fields, and
  the issue-template references. 550/550 JS tests pass (+1 new).

- **Popup capability-probe chip render (NF10 follow-up).**
  NF10 shipped the runtime `capability-probe` module + tests in
  v4.47.0. The popup consumer was deferred. This change wires it up:
  `popup.html` now loads `core/capability-probe.js` before `popup.js`;
  `popupState._capabilities` slot holds the probe result; an async
  `ensureCapabilityMap()` helper calls `capabilityProbe.runAll()` once
  at boot and caches the `{capability: bool}` map. The boot path fires
  the probe in the background (not awaited inline — `mediaDL` and
  `ollama` probes do HTTP fetches with a 1.5s timeout) and re-renders
  the schema overview once it resolves. `buildSchemaOverviewKeyRow`
  consults the cache via `capabilityProbe.isEntryAvailable(entry, caps)`
  and renders a red `.so-key-unavailable` chip on rows whose
  `requires:` array declares an unsatisfied capability (e.g.
  `localAiSummary` with `requires: ['summarizerApi']` in Chrome
  without the Summarizer origin trial; download* rows with
  `requires: ['mediaDL']` when the Astra Downloader companion isn't
  running). Tooltip lists the missing capability names so users
  understand the no-op. Same compact-pill geometry as the v4.39.0
  `.so-key-profile-gated` chip; red tone instead of amber. Pinned by
  a new `v4.47.0 NF10 follow-up — popup renders capability-probe
  Unavailable chip` hardening test that asserts script load order,
  the boot wiring, the row-builder hook, and the CSS variant.
  549/549 JS tests pass (+1 new).

- **stickyVideo + theater-split.user.js: fullscreen on live / previously-live videos no longer leaks the chat overlay.**
  Class of bug: `ytd-live-chat-frame` is positioned via `_positionOverRight`
  with `position:fixed; z-index:10001`. The old fullscreen handler in
  `stickyVideo` (`extension/ytkit.js`) and the parallel one in
  `theater-split.user.js` only hid `_splitWrapper` and `_splitLiveHeader`
  on `fullscreenchange`, leaving every entry in `_positionedEls` (chat
  frame on live + previously-live; `#below` on plain VODs) painting
  over the native fullscreen player. On live and previously-live videos
  this looked like "fullscreen doesn't work" — the player went
  fullscreen but the chat panel overlaid the right third of the screen.
  Fix: on enter, stash each positioned overlay's current `visibility`
  in a `_fullscreenOverlayStash` array and force
  `visibility:hidden !important`; on exit, restore the prior value.
  Destroy/teardown clears the stash so a teardown-during-fullscreen
  leaves no dangling references. The userscript got an equivalent
  patch (`fullscreenStash` state + `enterFullscreenStash` /
  `exitFullscreenStash` helpers, plus an extra step that moves the
  player out of `#ts-wrapper` before hiding the wrapper, because in
  the userscript the player IS a child of the wrapper — the extension
  already mounts the player at `position:fixed` from its natural-flow
  location so wrapper `display:none` doesn't trip Chromium's
  ancestor-display-none → exit-fullscreen rule). Pinned by a new
  `v4.47.0 stickyVideo — fullscreen handler hides positioned overlays`
  hardening test that asserts the enter branch initialises the stash +
  iterates `_positionedEls` + sets visibility hidden important, the
  exit branch iterates the stash + clears it, and destroy nulls the
  stash. 548/548 JS tests pass (+1 new).

- **videoHider: predicate ctx exposes `likes` + `subsCount` (NF16).**
  BlockTube ships `likes` in advanced blocking; PocketTube exposes
  subscriber count. Astra's predicate sandbox ctx now carries both
  for parity. `ctx.likes` comes from the cached `ytkit-ryd-cache`
  entry by videoId (or null when RYD is off or no entry exists),
  refreshed in-memory every 5s so predicate evaluation doesn't
  thrash storage during a feed scan. `ctx.subsCount` is best-effort
  parsed from the card's metadata text via a regex catching
  `<num><K|M|B|>?\s*subscriber` shapes (case-insensitive), returning
  null when no subscriber metadata is rendered. Predicates can now
  write rules like `likes != null && likes > 100000` or
  `subsCount != null && subsCount < 1000` (BlockTube + PocketTube
  parity). Two new helpers (`_extractSubsCount`, `_readRydLikes`)
  live next to `_extractVideoMetadata` in the videoHider feature.
  Pinned by a new `v4.47.0 NF16` hardening test (helpers exist;
  regex shape; storage key + 5s cache refresh; ctx wiring; parity
  comment; sandbox-evaluates the subs parser against 7 input
  patterns). Existing v3.25.0 "videoHider integrates predicate
  evaluator" test had its slice window extended from 4000 to 8000
  bytes to accommodate the two new helper functions sitting between
  the call site and the declaration. 547/547 JS tests pass (+1 new).

- **astra_downloader: FolderPickerService dialog watchdog (NF35).**
  `QFileDialog.exec()` blocks the Qt event loop while open. On slow
  file systems or stalled OS dialogs, the Flask handler that
  enqueued the request used to time out at 120s with no GUI-side
  diagnostic pointing at the cause. The watchdog times each `exec()`
  call and writes a persistent log line if the dialog blocked past
  the documented threshold (60 seconds — leaves a 60s margin before
  the Flask 120s timeout so the log gets written before the HTTP
  request gives up). Threshold lives on
  `FolderPickerService.DIALOG_WATCHDOG_THRESHOLD_SECONDS = 60` so a
  future operator can audit it. Pinned by three new
  `FolderPickerWatchdogTests`: threshold-constant-pin /
  log-emission-shape / threshold-gate-prevents-fast-dialog-spam.
  98/98 Python tests pass (+3 new).

- **Polish batch: EI-NEW2 / EI-NEW3 / EI-NEW4 / Phase V.** Four small
  fixes shipped together because each is under 200 lines:
    - **EI-NEW2 — `youtubeMusicCompat` exact-hostname match.** Replaced
      `location.hostname.includes('music.youtube.com')` with
      `location.hostname !== 'music.youtube.com'`. The previous
      substring match would have matched a hypothetical
      `music.youtube.com.phishing.io`; browser DNS resolution doesn't
      route to such a domain in practice, but project policy elsewhere
      uses exact equality. Existing
      `youtubeMusicCompat only runs on music.youtube.com` hardening
      test updated to match the new shape.
    - **EI-NEW3 — `reactionSpammer` configurable safety floor.** The
      hardcoded `_INTERVAL_MIN_MS: 500` constant became a settings-
      aware getter that reads
      `appState.settings.reactionSpammerMinIntervalMs` (default 500,
      schema risk `store-risk`/profile `github-full`) and clamps to a
      hard floor `_INTERVAL_MIN_MS_FLOOR: 500`. Admins of high-traffic
      streams can raise the floor (e.g. 1000 ms) to keep further from
      YouTube's automated-behavior heuristics — but cannot lower it
      below 500 ms because that defeats the safety guarantee from
      v3.23.0 N3. The existing v3.23 test that pinned the constant
      shape updated to pin the new floor constant name.
    - **EI-NEW4 — DeArrow TTL=0 warning + fallback indicator.** When
      `daCacheTTL === 0`, init now logs a `DebugManager` warning:
      "Cache disabled (daCacheTTL=0); every card hit fires an API
      request. Expect rate limits." Fallback titles (sentence/title-
      case applied when DeArrow has no submission) get a
      `data-da-fallback="1"` attribute on the clone; new CSS rule
      `opacity: 0.78` dims them so power users can tell the
      difference at a glance from real DeArrow submissions.
    - **Phase V — Iridium + Control Panel promoted into ROADMAP
      §Phase 1 matrix.** Both CWS competitors were noted in
      noted earlier but never
      formally scored. Added rows 21 + 22 with the standard
      columns; broader-scoring follow-up is open work.
  Pinned by a new `v4.47.0 polish batch` hardening test that asserts
  every invariant: youtubeMusicCompat exact-equality form,
  `_INTERVAL_MIN_MS_FLOOR` constant + getter + clamp, DeArrow
  TTL=0 log line + fallback CSS rule + fallback marker write,
  schema entry default, ROADMAP matrix promotion. Schema-count pin
  bumped 356 → 357; storage-size baseline updated by 35 bytes.
  546/546 JS tests pass (+1 new).

- **hideVideosFromHome: configurable subs-load pause threshold (NF33).**
  Before NF33: the subs-load pause gate halted pagination after any
  3-batch streak of 100%-hidden batches. Users hit this on healthy
  feeds where one unlucky batch happened to be all-spam — the next
  batch could have been 80% non-hidden but the streak was already past
  the gate. After NF33: a configurable
  `hideVideosSubsLoadHiddenRatio` setting (default 0.8) defines the
  cutoff; a batch qualifies as "mostly hidden" when its hidden ratio
  is >= the threshold. Three consecutive mostly-hidden batches still
  trip the pause (`hideVideosSubsLoadThreshold` unchanged). Invalid
  setting values (NaN, ≤0, >1) fall back to 0.8 at the call site so
  no corrupted import can disable the gate entirely. The
  `DebugManager.log` line now reports the ratio + cutoff explicitly so
  the diagnostic ring buffer shows which batches qualified. Pinned by
  a new `v4.47.0 NF33` hardening test that asserts the old
  `allHidden` gate is gone, the new ratio calculation + cutoff
  resolution are in place, schema/defaults/ytkit triple-source
  declares the new key with default 0.8, and sandbox-evaluates the
  gate against six scenarios (100%, 80%, 70% at default; invalid
  setting; out-of-range; stricter 0.95; looser 0.5). Schema-count
  pin bumped 355 → 356; storage-size baseline updated by 36 bytes.
  545/545 JS tests pass (+1 new).

- **digitalWellbeing: midnight / DST boundary detection (NF34).**
  Before NF34: `_sessionStart` was set once via
  `this._sessionStart || today.seconds` and never reset. When midnight
  crossed, `_loadToday` returned a fresh `{date, seconds:0}` bucket
  but `_sessionStart` still held yesterday's value;
  `sessionElapsed = today.seconds - _sessionStart` went negative and
  every break reminder was suppressed for the rest of the day.
  After NF34: `_tick` captures `_todayKey()` at the top, compares to
  a new `_lastTodayKey` instance field, and on flip resets both
  `_sessionStart = 0` and `_todayCache = null` so the next iteration
  anchors to the new day's accumulator. The OR initialization at
  `if (!this._sessionStart) this._sessionStart = today.seconds ?? 0;`
  now uses nullish-coalesce so today.seconds === 0 (first tick of a
  new day) correctly initializes. `destroy()` resets
  `_lastTodayKey = null` alongside `_sessionStart = 0` for symmetry.
  Rollover transitions emit a DebugManager line so the diagnostic
  ring buffer surfaces day-flips for ops. Pinned by a new
  `v4.47.0 NF34` hardening test that asserts the field declaration,
  the day-key capture, the flip detection, the reset shape, the
  nullish-coalesce init, the rollover log, and the destroy
  symmetry. 544/544 JS tests pass (+1 new).

- **returnDislike: budget-vs-network observability + cache-age titles
  (NF30).** Before NF30: any null from `_fetch` (whether 100/min budget
  cap or network error) collapsed into a single "RYD off" pill with no
  actionable copy — users assumed the feature was broken. After NF30:
  `_render` consults `_budgetWindow` to differentiate the two cases.
  Rate-limited path shows "RYD paused" + a title with the running
  counter (`<count>/100/min`) and seconds-until-window-reset
  countdown. Network-error path keeps "RYD off" but adds an
  explanatory title. The cached-data path adds an entry-age suffix
  (`<X>h old` or `<1h old`) so users see how stale the count is when
  the 24h-default TTL has been in play. The live-fetch path's title
  also shows the running quota counter so power users can pace their
  RYD-eligible browsing. Pinned by a new `v4.47.0 NF30` hardening
  test that asserts the budget check shape, the rate-limited /
  network-error / cached-age / live-quota title fragments. 543/543
  JS tests pass (+1 new).

- **transcriptViewer: language preference (NF29).** Non-English users
  always got English captions because `ytkit.js:21047` hardcoded
  `tracks.find(t => t.languageCode === 'en')`. NF29 ships a new
  `transcriptPreferredLanguage` schema entry (category `watch-player`,
  default `auto`) and a single shared `pickTranscriptTrack(tracks)`
  helper alongside `getSetting()`. The helper implements a 4-tier
  precedence:
    1. exact `languageCode` match for the user's
       `transcriptPreferredLanguage` setting (when not `auto`/empty)
    2. exact `languageCode` match for `navigator.language` base
       (e.g. `es-MX` → `es`)
    3. exact `'en'` (the v4.46.0 hardcoded fallback — preserved so the
       behaviour change is opt-in for users who don't set a preference)
    4. first available track
  All three transcript track-selection call sites in ytkit.js now
  route through the helper (was identical duplicated `tracks.find`
  chain in three places). Pinned by a new `v4.47.0 NF29` hardening
  test that asserts the helper signature, JSDoc, precedence shape,
  schema entry default, and sandbox-evaluates the helper against all
  four precedence tiers. Schema-count pin bumped 354 → 355; storage-
  size baseline updated by 37 bytes for the new key. 542/542 JS tests
  pass (+1 new).

- **astra_downloader v1.5.2: Deno cutoff hard-gate on `/download`
  (NF27).** yt-dlp ≥ 2026.04.01 ships an external n/sig solver and
  shells out to a JavaScript runtime (Deno is the documented option)
  to solve YouTube's signature challenges. Without Deno on PATH,
  recent yt-dlp builds silently return empty format lists and the
  download fails late with an opaque error. The `/health` probe
  already exposed `denoRuntime.ytdlpNeedsRuntime` + `installed`, and
  the extension rendered a "Deno: missing" warn pill — but `/download`
  accepted the request anyway. NF27 turns this into an actionable
  upfront 422 with `code: "deno-runtime-missing"` and an `advice`
  field carrying the Deno install command. The extension MediaDL
  download flow now detects the code and shows a 15-second amber
  toast with the install advice instead of the generic 5-second
  error toast. Pinned by three new
  `DenoRuntimeHardGateTests`: rejected_when_yt_dlp_needs_runtime_and_deno_absent /
  allowed_when_deno_installed / allowed_when_runtime_not_needed.
  95/95 Python tests pass (+3 new). 541/541 JS tests still pass.

- **astra_downloader: yt-dlp auto-update active-download guard (NF26).**
  `maybe_auto_update_ytdlp()` (astra_downloader.py:981) used to fire
  fire-and-forget; `yt-dlp.exe -U` atomically replaces the binary, and
  on Windows an in-flight `subprocess.Popen([YTDLP_PATH, ...])` could
  race the replace with file-in-use errors. New optional
  `active_count_fn` parameter — when supplied and returns > 0, the
  update is deferred and the next 24h throttle window picks it up.
  Caller in the GUI server-start path now passes
  `self.dl_manager.active_count` so the check consults the live queue
  without coupling the function to the manager instance. Probe
  failures (raising callable) fall through to "proceed with warning"
  — failure mode of an under-construction probe is at least as bad
  as racing the self-replace. Back-compat preserved: calling
  `maybe_auto_update_ytdlp(config)` without the new arg still works
  exactly as before. Pinned by four new `AutoUpdateActiveDownloadGuardTests`
  in `test_astra_downloader.py`:
  fires-when-zero / defers-when-positive / proceeds-when-probe-raises
  / back-compat-no-arg. 92/92 Python tests pass (+4 new).

- **check-versions: SETTINGS_VERSION parity gate (NF25).** The product
  version is enforced across 5 sources by `scripts/check-versions.js`;
  the schema-version namespace was not. Drift caught: `popup.js`
  fallback was `6` while `ytkit.js#SETTINGS_VERSION` was `7` and
  `settings-meta.json#settingsVersion` was `7`. The fallback only
  fires when the meta JSON fails to load, but when it does, the
  popup falls back to v6 schema while ytkit migrates to v7 — silent
  profile-import corruption. Closed by (a) bumping the popup
  fallback to `7` with a comment naming the NF25 invariant, and
  (b) extending `scripts/check-versions.js` with three new readers
  (`readYtkitSettingsVersion`, `readPopupSettingsVersionFallback`,
  `readSettingsMetaVersion`) and an independent settings-version
  pass that emits its own drift breakdown. Both the product-version
  and settings-version checks must pass for exit 0. Pinned by a new
  `v4.47.0 NF25` hardening test that asserts the three source values
  match + the gate carries the new reader functions + both branches
  + the popup-side invariant comment. 541/541 JS tests pass (+1 new).

- **ytkit.js: nyan-cat theme asset bundled inside the extension origin
  (NF23).** The `nyan-cat` theme's scrubber CSS used to load
  `assets/cat.gif` from a hardcoded `raw.githubusercontent.com` URL —
  both a remote-content surface and a CSP escape hatch. NF23 closes
  that: a new `getRepoAssetUrl(fileName)` helper alongside the existing
  `getBrandAssetUrl` returns `chrome.runtime.getURL('assets/' + name)`
  in extension contexts and falls back to the GitHub raw URL for the
  userscript build. `extension/assets/cat.gif` was added (3.3 KB, copied
  from the repo-root assets/) and `manifest.json#web_accessible_resources`
  now covers `assets/*`. The CSS in `_rawThemes['nyan-cat']` interpolates
  `${getRepoAssetUrl('cat.gif')}` at module-eval time so the URL bakes
  in once. Pinned by a new `v4.47.0 NF23` hardening test that asserts
  the helper exists with the documented fallback chain, the CSS
  interpolation is in place, the hardcoded URL is gone, the asset is
  bundled, and the manifest grants access.

- **scripts/i18n-coverage.js — locale coverage report (NF24).**
  `check-i18n.js` enforces structural parity (every EN key present
  everywhere, no orphans). What it doesn't flag is *content drift* —
  a locale shipping byte-identical to EN for most keys is silently
  incomplete because `chrome.i18n.getMessage` falls through to
  default_locale anyway. New `node scripts/i18n-coverage.js` (or
  `npm run i18n:coverage`) emits a human-readable
  `docs/i18n-coverage.md` with per-locale "translated vs.
  identical-to-EN vs. missing" counts plus a headline percentage.
  Informational only (not in `npm run check`); first run profiled 9
  locales × 247 keys and shows the existing locales sitting at
  70-85% translated (with the identical-to-EN remainder being
  brand-name + technical-format preservation by convention).
  Report includes a "how to improve coverage" workflow pointing at
  `scripts/generate-locales.js` for translator additions.

- **policy-profile: API-key scrub regex broadened (R6).** The previous
  `ALWAYS_SCRUB_KEY_PATTERNS` only matched the suffix `apiKey$` /
  `token$` plus the exact `aiSummaryApiKey`, so a future
  user-supplied key named `apikey_v2`, `bearerToken`, `webhookSecret`,
  or `authToken` would have slipped through into a shared export. R6
  adds four broader patterns:
    - `/apikey(?!_id$)/i` — catches `apikey_v2`, `api_key`, `apiKey1`
    - `/bearer/i` — catches `bearerToken`, `accessBearer`
    - `/secret/i` — catches `webhookSecret` etc.
    - `/^auth/i` + `/[a-z]Auth/` — catches `authToken` / `userAuth`
      while sparing camelCase mid-word
  Verified no false positives against the current 354-key schema
  (no entry contains `auth*`, `bearer`, `apikey`, or `secret` today;
  the broad patterns are forward-looking). Pinned by a new
  `v4.47.0 R6` hardening test that builds a synthetic settings
  object mixing 9 secret-shaped keys with 3 benign keys and asserts
  the export snapshot drops every secret-shaped key while preserving
  the benign ones.

- **CI: SBOM emit + static-eval source gate (NF20).** Closes NF20 from
  RESEARCH_FEATURE_PLAN. Two layers:
    1. `scripts/check-no-eval.js` (new) is a source-level grep that
       fails the build if `eval(`, `new Function(`, or
       `setTimeout/setInterval('string', ...)` (the legacy
       implicit-eval interface) appear in any of the 64 JS files the
       extension ships (extension/*.js + extension/core/**/*.js +
       extension/features/**/*.js + YTKit.user.js). Scope intentionally
       excludes tests/ and scripts/ — those are dev-time tooling that
       legitimately needs sandbox-evaluation. An `// allow-eval`
       same-line annotation provides an explicit per-line escape
       hatch for intentional cases.
    2. `.github/workflows/validate.yml` (the v4.47 NF11 PR-validation
       workflow) gains an SBOM step that runs `npm ls --omit=dev
       --json > sbom.json` and uploads it as a named artifact for
       future store-submission attachment.
  Currently passes with 0 findings — Astra was already CSP-compliant
  in practice; this is the belt-and-suspenders gate so a future
  contributor introducing `eval(` is flagged at npm-run-check time
  instead of at runtime CSP rejection time. Wired into
  `npm run check` (so the local check-gate and the CI step both
  enforce it). Pinned by a new `v4.47.0 NF20` hardening test that
  asserts (a) the script exists + is wired in package.json, (b) all
  four PATTERNS labels are present in the script source, (c) the
  `// allow-eval` escape hatch is documented, (d) validate.yml carries
  the SBOM emission + upload steps. 538/538 JS tests pass (+1 new).

- **extension/core/capability-probe.js — runtime capability detection
  (NF10).** Pairs with the NF17 schema `requires:` field shipped in
  the same v4.47 sprint. Exposes a PROBES table keyed by every
  CAPABILITIES enum entry (`summarizerApi`, `mediaDL`, `ollama`), a
  `runAll()` that resolves the full {name: boolean} map (async probes
  run in parallel), and an `isEntryAvailable(entry, capabilityMap)`
  helper that ANDs across every required capability. Probes are
  capability checks only — they never invoke the API, which keeps
  the probe surface store-policy-safe.

  Probe internals:
    - summarizerApi: synchronous existence check for
      `window.ai.Summarizer` (Chrome 138+ origin trial)
    - mediaDL: AbortController-bounded HTTP GET to /health on each of
      the six Astra Downloader fallback ports (9751/9761/9771/9781/
      9791/9851), with a strict 1500 ms per-port timeout so a hung
      server can't pin the probe
    - ollama: same AbortController pattern against
      127.0.0.1:11434/api/version

  Loaded ahead of ytkit.js via manifest content_scripts (after
  runtime-flags.js) and bundled into YTKit.user.js via
  sync-userscript.js#V5_BUNDLE_MODULES so both vehicles see the same
  singleton on globalThis.YTKitCore.capabilityProbe.

  Pinned by two new `v4.47.0 NF10` hardening tests:
    1. PROBES keys === CAPABILITIES enum (set-equal); per-entry shape
       (async:boolean + run:function); isEntryAvailable contract for
       no-requires, empty-requires, single-required, and multi-required
       cases; summarizerApi sync probe round-trip via window.ai mock;
       documented port list pinned.
    2. manifest content-script groups load capability-probe.js before
       ytkit.js.

  Existing v4.20.0 userscript bundle-order + verbatim-fingerprint
  tests extended to cover the new module. 537/537 JS tests pass
  (+2 new).

  Future work (carry-forward): popup row renderer consults
  `capabilityProbe.runAll()` at boot and renders an
  "Unavailable in this browser" chip on rows whose schema entry
  declares an unavailable capability. The probe is shipped + tested;
  the popup wiring stays as a follow-up so the chip can be designed
  alongside the schema-overview visual language.

- **lint: require-catch-reason rule widened to extension/popup.js
  (Phase L).** Closes the popup.js scope item from RESEARCH_FEATURE_PLAN
  Phase L. The v4.47.0 ESLint rule was previously enforced only on
  `extension/background.js`; the prior research file estimated 41
  catches in popup.js. An audit found that the rule only triggers on
  empty / comment-only bodies — popup.js carries 8 such catches total,
  7 already documented and 1 (line 2112, the diagnostic-log writeback
  best-effort guard) annotated in the same commit, plus 4 in the
  broadcast / broadcastSettingsReplaced fan-out helpers that had
  existing inline comments updated to use the `reason:` prefix.
  `eslint.config.js` factored the browser globals into a shared
  `sharedBrowserGlobals` constant and added a new file-group for
  popup.js with the rule enabled at `error`; `package.json#scripts.lint`
  passes both files to eslint. Further widening to
  `extension/core/*.js` and `ytkit.js` stays gated behind their own
  per-file annotation passes (~50 + ~175 catches respectively).
  Existing `v4.47.0 ESLint require-catch-reason rule is wired`
  hardening test extended to assert both file-group declarations and
  both lint-script entries. 535/535 JS tests still pass; `npm run
  check` green end-to-end (lint, a11y, contrast, npm audit, syntax,
  versions, i18n, settings).

- **ytkit.js: cssFeature notifies the feature-lifecycle on init/destroy
  (NF5 wave 2).** Wave 1 (commit `3f22e0e`) registered 21 peeled
  CSS-only feature ids with the v4.7.0 lifecycle module but kept the
  inline `cssFeature()` blocks as the sole source of init/destroy
  work — so `lifecycle.snapshot()` always returned `started:false`
  even when the feature was visibly active. Wave 2 routes the state
  transitions through the lifecycle: `cssFeature.init` now calls
  `Lifecycle.start(id)` after the CSS is injected, and
  `cssFeature.destroy` calls `Lifecycle.destroy(id)` after teardown.
  Production state and `snapshot()` state now match. The CSS injection
  + body-class toggle still happens in the cssFeature closure (full
  delegate — moving `injectStyle` into the peel modules or passing it
  through ctx — stays a wave-3 refactor). Guarded on
  `Lifecycle._features.has(id)` so unregistered feature ids skip the
  notification path. Pinned by a new `v4.47.0 NF5 wave 2` hardening
  test that asserts (a) the lifecycle singleton capture site,
  (b) the notify-on-init wiring inside cssFeature, (c) the notify-on
  -destroy wiring, plus (d) a sandboxed lifecycle start/destroy
  round-trip that verifies snapshot() transitions correctly. 535/535
  JS tests pass (+1 new).

- **popup: confirm-shell modal retired (NF14).** Closes NF14 from
  RESEARCH_FEATURE_PLAN. Project policy (ROADMAP house style +
  docs/architecture.md §Conventions) bans confirmation dialogs in
  favor of immediate-apply + undo-toast / soft-delete staging. The
  popup nonetheless shipped a fully styled `<div class="confirm-shell">`
  modal in popup.html with a `confirmAction()` helper in popup.js +
  ~100 lines of supporting CSS. Two callers existed:
    - `resetAllData` — now safe to apply immediately because EI2's
      Undo Reset button (shipped in the same v4.47 sprint) provides
      the recovery surface via a session-scoped storage snapshot.
    - `clearDiagnosticLog` — applies immediately because the
      diagnostic log is a runtime ring buffer of past errors, not
      user-authored data.
  Removed: the confirm-shell HTML, the confirmAction() function, the
  `.confirm-*` CSS rules, the eight i18n keys that fed the modal
  (`confirmEyebrow`, `confirmContinue`, `confirmCancel`,
  `confirmDestructiveEyebrow`, `clearLogTitle`, `clearLogMessage`,
  `resetAllTitle`, `resetAllMessage`) from all 10 locale bundles
  (en + 9 generated). `scripts/audit-popup-a11y.js` was updated to
  drop the confirm button dynamic-text exceptions; the Escape close
  + Tab focus rotation that used to live on the modal now applies to
  the popup body itself via the existing `handlePopupDialogKeydown`.
  Pinned by a new `v4.47.0 NF14` hardening test that asserts every
  former marker is gone (HTML, JS, CSS) and both former callers no
  longer await `confirmAction`. Existing tests that pinned the
  confirm-shell shape (popup-buttons-aria audit, clearDiagnosticLog
  caller assertion, buildExportData slice end) were updated to the
  new shape. 534/534 JS tests pass (+1 net new vs the 531 baseline:
  +3 NF12/NF14/NF17 wave, -0 retired tests).

- **settings-schema: CAPABILITIES enum + optional `requires:` field
  (NF17).** Closes NF17 from RESEARCH_FEATURE_PLAN. Lays the foundation
  for the NF10 capability probe (still pending) by extending the
  per-entry schema shape with an optional `requires: string[]` field
  drawn from a new well-known `CAPABILITIES` enum
  (`summarizerApi`, `mediaDL`, `ollama`). Four initial entries are
  seeded: `localAiSummary` + `subscriptionAiTags` declare
  `requires: ["summarizerApi"]` (Chrome Built-in window.ai.Summarizer
  origin trial), `downloadHistoryPanel` + `downloadHealthPanel`
  declare `requires: ["mediaDL"]` (Astra Downloader companion).
  Features that fall back gracefully (e.g. `popOutPlayer`'s
  Document PiP → standard PiP cascade) stay off the gated list. The
  npm-run-check gate (`scripts/check-settings.js`) now enforces field
  shape: must be a non-empty array of unique strings, every entry
  must be in the CAPABILITIES allowlist; the empty `[]` sentinel is
  banned (omit the field entirely instead). Pinned by two new
  `v4.47.0 NF17` hardening tests: (1) schema-side — CAPABILITIES
  enum shape + frozen-ness + lowerCamelCase + uniqueness, every
  `requires:` field well-formed, seeded entries present;
  (2) script-side — check-settings.js carries the validation block
  shape + the four banned-shape assertions. 382/382 JS tests pass
  (+2 new). check-settings still reports 354 entries match
  default-settings.json byte-for-byte.

- **CONTRIBUTING.md — document the two manual dev scripts (NF13).**
  Closes NF13 from RESEARCH_FEATURE_PLAN. The audit flagged
  `scripts/_gen-schema.js` and `scripts/generate-locales.js` as
  unreferenced by any `npm` script. After reading both, they are
  intentional one-shot generators kept for on-demand re-runs, not dead
  code — but a contributor reading the repo cold has no way to know
  that. CONTRIBUTING.md now carries a "Dev Scripts (Manual, Not in
  `npm run check`)" section that documents what each script does, how
  to run it, and when to run it.

- **extension/core/runtime-flags.js — typed accessors for the three
  internal coordination flags (NF12).** Closes NF12 from
  RESEARCH_FEATURE_PLAN. The flags `__ytkit_videoPopped` (popOutPlayer
  ↔ pipButton ↔ fullscreenOnDoubleClick coordination),
  `__ytkit_cpu_tamer` (CPU Tamer re-entry guard), and `__ytkit_debug`
  (Debug Mode marker) used to live as untyped writes directly on
  `window`. A misspelled flag would silently break the cooperation
  chain — and the `// reason:` ESLint rule couldn't catch a silent
  global typo. The new module exposes typed get/set for each flag
  while keeping `window.__ytkit_*` as the underlying storage (so
  console power users and the userscript build's globalThis-bound
  reads still see the same values). Twelve call sites in ytkit.js
  migrated from `window.__ytkit_X = …` / `if (window.__ytkit_X)` to
  `RuntimeFlags.setX(…)` / `if (RuntimeFlags.getX())`. Module is
  loaded ahead of ytkit.js via `manifest.json` content_scripts and
  bundled into YTKit.user.js via `sync-userscript.js#V5_BUNDLE_MODULES`.
  Pinned by three new `v4.47.0 NF12` hardening tests: (1) module
  surface + ytkit.js capture + ban on direct `window.__ytkit_*` writes
  and reads + sandbox-eval round-trip; (2) sync-userscript bundle
  inclusion; (3) manifest content-script load order before ytkit.js.
  Existing v4.20.0 bundle-order and verbatim-fingerprint tests
  extended to cover the new module. 531/531 JS tests pass (+3 new).

- **CI: PR-time validation workflow (.github/workflows/validate.yml).**
  Closes NF11 from RESEARCH_FEATURE_PLAN. The release workflow
  (build.yml) runs only on `v*` tag pushes, so a regression used to
  land on `main` before any CI run caught it. The new workflow runs on
  every `pull_request: branches: [main]` and `push: branches: [main]`
  and executes the same two gates the release path runs (`npm test`
  and `npm run check`) plus a Python job that installs the
  astra_downloader requirements pinned in requirements.txt and runs
  `python -m pytest astra_downloader`. Tag-triggered build.yml stays
  unchanged so the release path remains self-validating; tag pushes
  skip the validate workflow by design (the `push: branches: [main]`
  trigger does not fire on tag-only refs).

- **RESEARCH_FEATURE_PLAN.md — consolidated active backlog.** Folds the
  2026-05-25 reconciliation companion back into the canonical research
  plan. The file is now an open-items-only backlog organised by
  readiness (browser-bounded captures, CI/DX, lint widening, lifecycle
  adoption, companion hardening, subscription manager v2, research
  workspace, polish/parity, quality gates, store/docs, residual
  risks); completed items live in this CHANGELOG, the long-arc plan
  stays in ROADMAP.md, contributor orientation stays in
  docs/architecture.md. The dated companion file
  RESEARCH_FEATURE_PLAN_2026-05-25.md is deleted (folded back in).

- **docs/architecture.md — contributor orientation map.** Covers the
  four moving parts (MV3 extension, userscript, Astra Downloader
  Python companion, toolbar popup), end-to-end data flow for a watch
  page load and a download, where things live (settings schema,
  feature definitions, selector packs, lifecycle module, etc.), the
  five trust boundaries with what each is allowed to touch, ten
  conventions a contributor needs (no keyboard shortcuts, no confirm
  dialogs, dark only, init/destroy contract, TrustedTypes safety,
  stable-selector-first, `// reason:` invariant, schema parity, version-drift gate), worked
  examples for adding a CSS-only feature and a DOM-observation
  feature, and a debugging primer. Linked from README's
  Documentation index and CONTRIBUTING's preface. Closes the
  Phase H contributor-architecture-map item from
  RESEARCH_FEATURE_PLAN.

- **End-to-end download test with mocked yt-dlp.** Closes EI14 from
  RESEARCH_FEATURE_PLAN. The 80 prior Python tests covered
  normalisation, security, rate-limiting, etc. but never invoked the
  full `/download → spawn yt-dlp → parse progress → mark complete →
  write history` flow. A regression in the parsing loop (filename
  detection, MDLP_JSON progress regex, status transitions, ERROR-line
  truncation) would ship silently. New `EndToEndDownloadTests` class
  uses `unittest.mock.patch` to replace `subprocess.Popen` with a
  fake that yields synthetic yt-dlp stdout lines + a controlled
  returncode — no real yt-dlp invocation, no fixture file, sub-second
  hermetic. Two cases:
    • `test_full_download_flow_marks_complete_and_writes_history` —
      3 progress lines + a Merger line; asserts status=complete,
      progress=100, filename parsed, history entry written with the
      right url/format/audioOnly.
    • `test_yt_dlp_nonzero_exit_with_error_marks_failed` — returncode=1
      with an ERROR line; asserts status=failed, error surfaces the
      yt-dlp text, no history entry written.
  88/88 Python tests pass (+2 new).

- **Astra Downloader v1.5.1 — HTTP-surface size cap (both directions).**
  Closes EI12 from RESEARCH_FEATURE_PLAN. The Flask process previously
  had no explicit Content-Length cap on either incoming bodies or
  outgoing responses — relied entirely on Waitress's internal limits.
  Two new constants harden both edges:
    • `MAX_REQUEST_BYTES = 1 MB` — wired into Flask via
      `app.config['MAX_CONTENT_LENGTH']` so an oversized POST gets a
      413 before any handler runs (all legitimate payloads — the
      extension popup + ytkit.js EXT_FETCH — are <2 KB; 1 MB is the
      defensive margin)
    • `MAX_RESPONSE_BYTES = 10 MB` — enforced inside `cors_response`,
      which measures `len(resp.get_data())` and swaps oversized
      payloads for a 413 error body before the wire layer transmits
      anything. /history already caps to 500 entries and /health is
      tiny, so the ceiling never trips today — but a future
      /streamlinks or /logs endpoint can't silently stream megabytes.
  APP_VERSION bumps 1.5.0 → 1.5.1; `SERVICE_API_VERSION` stays at 2
  (additive, backward-compatible). 4 new pytest cases pin the
  constants, the Flask wiring, the real 413 round-trip, and the
  outgoing guard source shape. 86/86 Python tests pass (+4 new).

- **Array settings get a checkbox-grid editor.** Previously, array-type
  schema entries like `hiddenChatElements`, `hiddenActionButtons`,
  `hiddenPlayerControls`, and `hiddenWatchElements` were edited in the
  popup as raw JSON textareas (v4.41.0 surface) — power-user-only UX
  for what is conceptually a multi-select. New optional `knownValues`
  field on a schema entry declares the canonical enumeration; the
  popup's array-editor branch now forks on knownValues presence and
  renders a flex-wrap checkbox grid (one box per token, click to
  add/remove from the array). The 4 hidden-* entries now carry
  knownValues; `syncSafePrefsAllowlist` (70+ items) deliberately keeps
  the JSON path. Persist is order-preserving — known-values order
  first (deterministic for export/import round-trips), unknown tokens
  preserved at the tail so a saved value with deprecated tokens
  doesn't lose them. New `v4.47.0 NF7 — array schema entries with
  knownValues render checkbox grids` hardening test pins the schema
  invariant (knownValues must be a superset of defaultValue), the
  popup branch ordering, and the CSS surface. 528/528 tests pass (+1).

- **Popup "Enable Downloader Prompts" action surfaces after "Skip for now".**
  `MediaDLManager.showInstallPrompt` writes `ytkit_mediadl_prompt_dismissed
  = true` to `chrome.storage.local` when the user clicks "Skip for now"
  in the in-page install dialog. That dismiss was permanent and there
  was no obvious recovery path — users who later changed their mind had
  to manually edit storage. The popup now surfaces a small recovery
  button (hidden by default, auto-revealed on boot when the flag is
  set) that removes the key via `chrome.storage.local.remove`.
  Subsequent YouTube page loads naturally re-enable the install
  prompt via the existing `storageRead` gate. 4 new i18n keys added
  to en + 9 non-EN locales. New `v4.47.0 NF6 — Reinstall Astra
  Downloader popup action clears the dismissed flag` hardening test
  pins the button + storage-key constant + click listener wiring +
  cross-file key parity with the ytkit.js write site. 527/527 tests
  pass (+1).

- **Reset action is now reversible (within the browser session).**
  Previously, the popup Reset wiped `chrome.storage.local` after one
  confirm dialog and there was no recovery — a misclick destroyed all
  354 settings, hidden lists, blocked channels, and bookmarks. Now
  `resetAllData` snapshots every key in `chrome.storage.local` into a
  `_resetSnapshot` entry on `chrome.storage.session` BEFORE the wipe,
  and an "Undo Reset" button (hidden by default, auto-revealed when a
  snapshot exists) restores the snapshot byte-for-byte. Session
  storage is the right home — the snapshot deliberately does NOT
  survive a browser restart (stale snapshots overwriting later real
  edits would be worse than the original problem) but does survive a
  popup close/reopen so the user sees the Undo button on the next
  launch. 6 new i18n keys added to en + 9 non-EN locales. New
  `v4.47.0 EI2 — Reset writes a session-scoped snapshot and Undo
  restores it` hardening test pins the snapshot-before-wipe ordering,
  the snapshot-key constant, the click-listener wiring, and the
  locale parity. 526/526 tests pass (+1).

- **NF5 wave 1 — feature-lifecycle module is no longer unused.** The
  v4.7.0 `core/feature-lifecycle.js` shipped `createLifecycle()` +
  `defineFeature()` but had zero callers anywhere in the codebase
  until now. All 6 CSS-only peel modules
  (`features/subtitles`, `features/video-filters`,
  `features/blue-light-filter`, `features/theme-css`,
  `features/wave-8-css`, `features/home-subs-css`) now register their
  21 feature ids with the lifecycle singleton via
  `getLifecycle().defineFeature(spec)` at module-evaluation time. Each
  spec carries the canonical id + category (verified against
  `core/settings-schema.js` so the categories don't drift) + no-op
  `init`/`destroy` for now. This is a "register-only" wave —
  `ytkit.js`'s inline `cssFeature()` blocks still own the real
  `injectStyle` / cleanup. Wave 2 will flip the inline blocks to
  delegate via `lifecycle.start(id)` / `lifecycle.destroy(id)` one
  category at a time without touching the registration glue. Pinned
  by `v4.47.0 NF5 wave 1 — every CSS-only peel module registers with
  the lifecycle` hardening test (source-level call-site checks for
  every peel + a sandboxed `snapshot()` round-trip against the
  lifecycle module). 525/525 tests pass (+1).

- **New ESLint rule `local/require-catch-reason`.** Pins the v3.14.0
  hardening invariant — every empty catch body must carry a
  `// reason:` (or `/* reason: */`) comment explaining why swallowing
  the error is correct, otherwise it must contain at least one
  executable statement (logging, returning, anything that leaves a
  trail). Non-empty catches always pass. Wired into `eslint.config.js`
  as `error` on `extension/background.js`, which is now 100 %
  compliant (one inner `catch (__) { /* */ }` at `background.js:414`
  got the `// reason:` it was missing). Wider rollout to popup.js
  (41 catches), ytkit.js (175), and core/*.js (50) is gated behind
  a per-file violation audit + bulk annotation pass — the rule itself
  is identical for each file. New
  `v4.47.0 ESLint require-catch-reason rule is wired and enforces
  v3.14.0 invariant` hardening test exercises six contract cases
  against synthetic source via the ESLint Linter API. 524/524 tests
  pass (+1).

- **Popup ships a "Copy report" button on the selector-health dashboard.**
  Bundles `core/selector-health.js` into `popup.html` so
  `formatSelectorCopyReport` runs client-side, then fetches the same
  `YTKIT_GET_SELECTOR_HEALTH` payload that already drives the dashboard
  and formats it into a multi-line ASCII bug-report-ready block
  (product version, exportedAt, browser UA, summary, top problem
  surfaces, ctx counts, active tab URL). Clipboard write prefers
  `navigator.clipboard.writeText` with `execCommand('copy')` fallback
  for tightly-locked-down contexts. An aria-live status line announces
  outcome to screen readers. `_selectorHealthCopyInFlight` guard
  prevents duplicate posts on rapid double-clicks. 7 new i18n keys
  added to en + 9 non-EN locales (English placeholders pending a
  future locale sweep). New `v4.47.0 popup ships selector-health
  "Copy report" wiring end-to-end` hardening test. 523/523 tests
  pass (+1).

- **Popup search filter gains a mini-DSL.** Free-text matching still
  works, but now `risk:api`, `category:downloads`, `scope:watch`, and
  `profile:store-safe` narrow by settings-schema metadata. Comma-
  separated values inside a field act as OR (`risk:api,local-companion`);
  multiple field clauses AND. Unknown fields (typos) fall back to free
  text so user input is never silently swallowed. Wired into both the
  quick-toggle list (joins each toggle to its schema entry by key) and
  the schema overview (`renderSchemaOverview`). Schema overview free-
  text also now matches humanised labels and `description`. Placeholder
  copy + English locale string + tooltip updated to surface the syntax.
  New `v4.47.0 popup search mini-DSL parses field filters and forwards
  free text` hardening test pins the parser shape and AND/OR semantics.
  522/522 tests pass (+1).

- **`CONFLICT_MAP` now flags `forceH264 ↔ codecSelector`.** Closes the silent-
  override bug in `_syncMainWorldCodec` (`ytkit.js:1143-1146`) where the user
  could set `codecSelector = 'av1'` while `forceH264` was also on and silently
  get H.264 with no UI feedback. Now the popup toast surfaces the conflict
  and auto-disables one of the pair. New hardening test
  `v4.47.0 CONFLICT_MAP pins the documented mutually-exclusive pairs` pins
  the full map shape AND pins the cooperative-pair comment block (focusedMode,
  autoPauseOnSwitch + pauseOtherTabs, popOutPlayer + pipButton +
  fullscreenOnDoubleClick, hideEndCards parent/sub of hideVideoEndContent) so
  a future audit doesn't mechanically re-add pairs whose mutual exclusion has
  been intentionally engineered away. CLAUDE.md §Architecture Notes synced
  to match the actual code (was claiming 6 conflict pairs that the in-code
  comments explicitly named as cooperative). 521/521 tests pass (+1).

- **`npm run check` now runs `npm audit --omit=dev --audit-level=moderate`**
  via a new `audit:deps` script. Closes the G4 finding from
  RESEARCH_FEATURE_PLAN — vulnerability advisories were spot-checked per
  hardening pass but not gated per-PR. Currently passes with 0 advisories.
- **Pinned the popup's `prefers-reduced-motion` global guard.** `popup.css`
  has always carried the universal `* { animation: none !important;
  transition: none !important; }` rule under
  `@media (prefers-reduced-motion: reduce)`; a new hardening test
  (`v4.47.0 popup.css honours prefers-reduced-motion globally`) pins
  the shape so a future refactor cannot silently scope it narrower or
  drop it. 520/520 tests pass (+1).
- **README**: badge now uses `shields.io/github/v/release/SysAdminDoc/Astra-Deck`
  so it self-updates per release tag (was hardcoded to `4.5.2`, drifted past
  v4.46.0). Added a **Power-User Console Helpers** table documenting the
  `?ytkit=safe` URL parameter, `ytkit.unsafe()` console toggle, the four
  `window.__ytkit*` entry points (`OpenAnalytics`, `SearchTranscripts`,
  `ClearTranscriptIndex`, `Diagnostics.download`), `window.__ytkitProfiles`,
  and `window.__ytkitAnnounce`. Added a **Documentation** index cross-linking
  ROADMAP, RESEARCH_FEATURE_PLAN, CHANGELOG, HARDENING, CONTRIBUTING, and
  the five `docs/*.md` references that were previously buried.
- **Repo cleanup**: removed orphan `*.bak` editor backups and a duplicate
  `YTKit-v1.2.0.user.js` from the repo root. `*.bak` was already in
  `.gitignore`; canonical archive copy lives at `archive/YTKit-v1.2.0.user.js`.
- **Research companion**: `RESEARCH_FEATURE_PLAN.md` added as the v4.46.0+
  code-audit punch list. Phases A–H with Quick-Wins and Larger-Bets sections;
  references but does not duplicate `ROADMAP.md`.

## [4.46.0] - 2026-05-24 - extreme audit cut (H25): SW + popup + Python downloader hardening

Deep audit pass across the three production-critical surfaces (service
worker, toolbar popup, Astra Downloader companion). Three defensive
gaps closed, four regression tests pinned, plus a developer-experience
fix for the Python test suite.

### Service worker (`extension/background.js`)

- **Hydration bypass of `PENDING_REVEALS_CAP`** — `_pendingRevealsReady`
  loaded the persisted "show in folder" id list from
  `chrome.storage.session` straight into the in-memory `Set` with an
  unbounded `for (const id of ids) _pendingReveals.add(id)`. The runtime
  add path (`_addPendingReveal`) was already cap-enforced, but the
  hydration path was a hole: a corrupted or oversized session-storage
  payload (older release, partial-write race, manual edit) would
  re-introduce the runaway memory growth the cap was added to defend
  against. Hydration now `Math.max(0, ids.length - PENDING_REVEALS_CAP)`
  slices from the tail and validates each entry is a `number` before
  inserting.
- **Silent fallthrough on unknown `msg.type`** — the
  `chrome.runtime.onMessage` listener used to return implicitly when no
  `if (msg.type === ...)` branch matched, leaving the caller's
  `chrome.runtime.sendMessage` Promise to reject with the generic
  *"The message port closed before a response was received."* An
  in-extension typo (`EXT_FECTH` for `EXT_FETCH`) was hard to diagnose
  in practice. The listener now responds explicitly with `{ error:
  'Unknown message type: <type>' }`.

### Toolbar popup (`extension/popup.js`)

- **Firefox export anchor fallback** — when
  `chrome.downloads.download` is unavailable, the export flow falls
  back to an `<a download>` click. The anchor was previously created
  via `Object.assign(document.createElement('a'), …)` and clicked
  without being appended to the DOM — historically a no-op on Firefox.
  In production the fallback is unreachable (the manifest declares the
  `downloads` permission so `chrome.downloads.download` is always
  available), but defensive coding mandates the fallback work on both
  engines. Anchor is now `document.body.appendChild`-ed, clicked, and
  `.remove()`-d in a `try / finally` so the DOM stays clean.

### Python test suite (`pytest.ini`)

- **`asyncio_default_fixture_loop_scope` deprecation** — pytest-asyncio
  ≥0.23 warns on every test run that the value is unset; the upcoming
  1.0 release will change the default. Pinned the value to `function`
  (the future default) so every `python -m pytest astra_downloader`
  invocation now runs cleanly without the warning preamble.

### Verification

- **`npm test`** → **519 / 519 passing** (+4 new regression tests in
  `tests/hardening.test.js` covering the three SW/popup fixes and the
  pytest.ini pin).
- **`npm run check`** → lint + a11y audit + WCAG-AA contrast + i18n +
  version + syntax — all green.
- **`python -m pytest astra_downloader -q`** → **82 / 82 passing**, no
  deprecation warnings.
- **`node build-extension.js --bump minor`** → all four artifacts
  (Chrome ZIP/CRX, Firefox ZIP/XPI) produced.

### Files audited but not changed

Read deeply during this pass and found no actionable issues at the
current quality bar: `extension/core/trusted-html.js` (TT policy is
correctly scoped), `extension/core/storage-manager.js` (debounce +
echo dedupe invariants hold), `extension/core/predicate-sandbox.js`
(AST evaluator already rejects every JS-unsafe pattern),
`astra_downloader/astra_downloader.py` cookie/path/URL normalisers
(consistent input validation across the bridge boundary).

## [4.45.0] - 2026-05-24 - premium UX polish: rectangular toggles + typography rhythm

Aggressive premium-polish pass on the two primary user surfaces (the
toolbar popup and the in-page settings panel) — no feature changes,
no behaviour changes, just a tighter, more intentional finish.

### Pill-backdrop hard-rule sweep

The house style allows backdrop radii of `0/4/6/8/10/12` only. Earlier
releases left a handful of borderline stadium/pill shapes (radius ≥ ½
of element height) that read as "default AI styling" instead of
deliberate design. This pass replaces every one with a rectangular
small-radius equivalent — thumbs, dots, and avatars stay circular as
the rule allows.

- **`.switch` toolbar toggle** — 20 px tall track, was `border-radius:
  10px` (exact stadium-pill ratio); now `6 px` rectangular. Thumb stays
  a true circle.
- **`.ytkit-switch-track` in-page toggle** (visible on every feature
  card in the settings panel — the single most-touched control in the
  product) — same fix: `10 px` → `6 px`. Settings panel scrollbar thumb
  follows down from `10 px` → `3 px`.
- **Popup chips** — `.brand-version` (`10 px` → `6 px`), `.app-status`
  (`10 px` → `8 px`), `.toggle-group-count` (`10 px` → `4 px`),
  `.clear-search` (`10 px` → `6 px`), `.toggle-skeleton::after`,
  `.skeleton-line` all updated.
- **Tokens** — retired the misleading `--radius-pill: 10px` token. The
  new explicit scale is `--radius-tight: 4px`, `--radius-chip: 6px`,
  `--radius-xs: 8px`, `--radius-sm: 10px`, `--radius-md/lg/xl: 12px`.
  Future surfaces grab a value with intent, not "the round one".

### Typography rhythm

- **Font weights** normalised to standard CSS values. The `850`
  weight (Aptos Variable resolves it to `~825`, every other font
  rounds to `800`) is replaced with explicit `800` across the popup
  for a stable cross-browser render.
- **Stat-card labels** bumped from `9 px` to `9.5 px` with `0.1 em`
  letter-spacing for better tabular legibility; padding nudged from
  `8 8` → `10 8` so the value/label pair has more breathing room.
- **Quick-toggle description** `10.5 px` → `11 px` — easier to scan
  the secondary line without crowding the title row.

### Language select chevron

The `<select>` dropdown indicator was two diagonal CSS gradients
combined into a triangle — sharp at 100 % zoom, fuzzy everywhere
else. Replaced with an inline-SVG chevron data URI so it stays crisp
at any DPI, plus a switch to the shared `--accent-border` +
`--focus-ring` tokens so its hover/focus state matches the rest of
the popup (was hand-rolled rgba values).

### Verification

- `npm test` → **515 / 515 passing** (no regressions in the existing
  hardening pill-rule tests at `tests/hardening.test.js:2480` and
  `:3971`).
- `npm run check` → lint + a11y audit + WCAG-AA contrast audit + i18n
  all green. Contrast ratios on the touched colours: primary text
  18.4 : 1, banner text 8 : 1+ — well above target.
- `node build-extension.js --bump minor` → all four artifacts (Chrome
  ZIP/CRX, Firefox ZIP/XPI) produced.

## [4.44.0] - 2026-05-21 - v5.1.0 carry-forward arc closed (documentation tag)

No code changes from v4.43.0 — version bump + documentation tag
declaring the v5.1.0 carry-forward arc complete. Every
acceptance-criterion item in the v5.0.0-foundation carry-forward
list (ROADMAP.md L40-49) is now either checked `[x]` or marked
`[~]` with a v5.2.0+ scope explicitly named in plain English.

### Cumulative scoreboard (v5.1.0)

| | |
|---|---:|
| Versions shipped | 14 (v4.31.0 → v4.44.0) |
| Tests added | +64 (451 → 515) |
| Carry-forward items closed `[x]` | 5 of 8 (#1, #4, #5, #7, #8) |
| Carry-forward items deferred `[~]` | 3 of 8 (#2, #3, #6 — all with v5.2.0+ scope notes) |
| New `extension/core/` modules | 1 (toast-dom — paired with the existing 7 v5.0.0 core modules) |
| New `extension/core/selector-packs/` files | 26 (full migration; `INLINE_SURFACES` now `{}`) |
| New `extension/features/` modules | 2 (wave-8-css + home-subs-css — 11 CSS-only features peeled) |
| Popup editor coverage | 354 of 354 schema keys (was ~340) |
| New popup surfaces | profile-badge chip on github-full-gated rows + array/object JSON textarea editor |
| New popup labels | labelKey/descriptionKey overrides on 4 brand-name schema entries |
| `npm run check` + `npm test` + `node build-extension.js` | Green at every step |

### Closed `[x]` carry-forward items

1. **Selector-pack file split** — v4.31.0 → v4.37.0 (7 batches).
   All 28 surfaces (+ 2 aliases) live in
   `extension/core/selector-packs/<surface>.js` with
   `captureEvidence` + `lastVerified`. `INLINE_SURFACES = {}`;
   the pack registry drives `SurfaceSelectorMap`.
4. **DOM-layer toast extraction** — v4.42.0.
   `core/toast-dom.js#createToastSystem` is the canonical
   implementation; ytkit.js delegates via a cached system with
   byte-identical inline fallback.
5. **Array / object editors in the popup** — v4.41.0.
   `<textarea.so-key-json>` + `.so-key-json-error` pill; commit
   via `JSON.parse` with type-shape guards. Popup editor
   coverage is now **354 / 354** schema keys.
7. **Profile-badge integration** — v4.39.0.
   `.so-key-profile-badge.so-key-profile-gated` chip on
   github-full rows when the effective profile is store-safe;
   cached `createPolicyProfile()` instance.
8. **`labelKey` / `descriptionKey` override fields** — v4.40.0.
   Four brand-name overrides applied so far
   (`downloadCobaltFallback`, `downloadCobaltInstance`,
   `aiSummaryEndpoint`, `aiSummaryProvider`).

### Deferred `[~]` carry-forward items (v5.2.0+ scope)

2. **Feature peels (long tail)** — 21 of ~200 monolith blocks
   peeled this session (wave-8-css quintet + home-subs-css
   sextet + 10 prior v5.0.0 peels). Continue batch-by-batch in
   v5.2.0+; DOM-walking observers are blocked on #3 and stay
   v5.2.0+.
3. **Per-feature lifecycle adoption** — multi-slice initiative
   that changes feature-internal init/destroy semantics. Needs
   paired DOM-walking peels + visible-behaviour QA per
   category. The v4.7.0 contract + v4.9.0 lifecycle-route
   bridge are ready for adoption when category owners are
   available.
4. ~~_(toast extraction — closed above)_~~
6. **i18n translation pass** — 13 placeholder keys still ship
   English-everywhere across all 10 locales. The `t()` helper
   already falls through to inline English, so user-visible
   behaviour stays correct. Shipping unverified machine
   translations would risk localisation regressions; a focused
   locale-by-locale sweep with native-speaker review is the
   right path.

### Why a documentation tag

The v4.30.0 documentation tag closed the v5.0.0 foundation arc.
The v4.44.0 tag mirrors that pattern for the v5.1.0 carry-forward
arc: a clean reference point future sessions can cite when
starting v5.2.0+ work, and matches the v4.44.0 binary artifacts
shipped in `build/`. The five carry-forward items closed `[x]`
collectively delivered the largest user-visible surface change
since v4.0.0: the popup is now a full settings editor (354/354
keys), the selector map is per-surface rollback-able, and the
two DOM primitives the v5.2.0 "control center" surface will
build on (`toastDom`, `policyProfile`) are both factory-shaped
and unit-testable in isolation.

## [4.43.0] - 2026-05-21 - feature-peel batch 2 (6 home / subs CSS-only features)

Continues carry-forward item #2. Six Home / Subscriptions
cssFeature() callsites peel into
`extension/features/home-subs-css/index.js`:
`hideCreateButton`, `hideVoiceSearch`, `widenSearchBar`,
`disablePlayOnHover`, `fullWidthSubscriptions`,
`hideSubscriptionOptions`.

Same pattern as the v4.38.0 wave-8 batch: pure builders in the
module, inline literal preserved as a byte-identical fallback for
the userscript / module-unavailable path, manifest +
`V5_BUNDLE_MODULES` extended.

### Verification

- 515 tests pass (was 510; +5 home-subs regressions).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.43.0.

## [4.42.0] - 2026-05-21 - DOM-layer toast extraction (core/toast-dom.js)

Closes carry-forward item #4. The DOM-touching `showToast` /
`dismissToast` functions move into
`extension/core/toast-dom.js` behind a `createToastSystem()`
factory; ytkit.js keeps a byte-identical inline fallback so the
userscript / module-unavailable path still works exactly as
before.

### Added

- `extension/core/toast-dom.js` exporting
  `createToastSystem({ zIndex, inferToastTone, getToastRgb,
  getToastBadgeLabel })` → `{ showToast, dismissToast }`. The
  factory takes its dependencies as inputs (rather than reading
  them off the global) so the module is unit-testable in
  isolation. Both DOM functions match the prior monolith bodies
  for the parity check.
- `extension/ytkit.js` — `_getToastSystem()` builds the system
  on first call and caches it. `showToast` + `dismissToast`
  delegate via the cached system; the existing inline bodies
  remain as the byte-identical fallback when the module isn't
  loaded.
- `extension/manifest.json` — both ISOLATED content-script
  blocks load `core/toast-dom.js` immediately after
  `core/toast.js` (the pure-helpers module it depends on) and
  before `ytkit.js`.
- `sync-userscript.js` — `V5_BUNDLE_MODULES` extended with
  `core/toast-dom.js` so the userscript ships the module too.
- `tests/hardening.test.js` — 6 new v4.42.0 regressions: module
  existence + createToastSystem export, factory produces the
  showToast + dismissToast pair, monolith wires `_getToastSystem`
  + delegation, byte-stable parity markers across both
  implementations, manifest load-order (toast → toast-dom →
  ytkit), and `V5_BUNDLE_MODULES` ordering.

### Why

`core/toast.js` (v4.14.0) shipped only the pure helpers; the
DOM-touching code stayed in the 43k-line monolith and was
untestable in isolation. The DOM peel makes it possible to build
a control-center toast preview from the same canonical code, and
matches the per-slice instruction in the v5.1.0 brief ("leave
the inline byte-stable fallback per the existing peel pattern").

### Verification

- 510 tests pass (was 504; +6 toast-dom regressions).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.42.0.

## [4.41.0] - 2026-05-21 - array / object JSON editors in the schema overview

Closes carry-forward item #5. The popup schema overview can now
edit every type — closes editor coverage from ~340 to **354 of 354**
schema keys.

### Added

- `extension/popup.js` — `buildSchemaOverviewKeyRow` gains an
  `array | object` branch that renders a `<textarea.so-key-json>`
  pre-populated with `JSON.stringify(value, null, 2)` and a
  `.so-key-json-error` pill below. Commit happens on change/blur
  via `JSON.parse`; failures stamp the pill with
  `"Invalid JSON: <reason>"` and skip persistence. Type-shape
  guards reject array→object and object→array shape flips
  up-front so a paste accident can't silently corrupt the store.
- `extension/popup.css` — `.so-key-json-wrap`, `.so-key-json`
  (6 px backdrop radius — house style), `.so-key-json-error`
  (4 px radius, amber-red tone).
- `tests/hardening.test.js` — 6 new v4.41.0 regressions:
  textarea + error-pill branch wired, pretty-print + parse
  round-trip, type-shape guards, persist-skips-on-parse-error
  ordering, sub-8 px CSS radii on both the editor and the pill,
  and a coverage canary that ≥1 array AND ≥1 object entry remain
  in the schema. The v4.24.0 array-length read-only canary is
  rewritten to expect the v4.41.0 JSON-editor branch.

### Why

The remaining 14 array + object schema keys
(`hiddenChatElements`, `hiddenVideos`, `hiddenChannels`,
`hiddenWatchElements`, `subscriptionGroupData`, etc.) were the
last bucket the popup couldn't edit. The JSON-textarea editor
matches the per-slice instruction in CLAUDE.md / the v5.1.0 brief
exactly: round-trip via `JSON.stringify(value, null, 2)` and
`JSON.parse` on commit, parse-error pill below an invalid
textarea. Real per-key custom UIs (multi-select for
`hiddenChatElements`, channel-handle list for
`hiddenChannels`, etc.) can layer on top of this in v5.2.0+
without breaking the JSON-fallback path.

### Verification

- 504 tests pass (was 498; +6 JSON-editor regressions, +0 from
  the v4.24.0 rewrite).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.41.0.

## [4.40.0] - 2026-05-21 - labelKey/descriptionKey override fields on schema entries

Closes carry-forward item #8. Schema entries gain optional
`labelKey` + `descriptionKey` fields that override the v4.28.0
deterministic humaniser for brand-name / domain-specific strings
where the algorithmic label is imprecise.

### Added

- `extension/core/settings-schema.js` — four brand-name entries
  gain overrides:
  - `downloadCobaltFallback` → "Cobalt download fallback"
  - `downloadCobaltInstance` → "Cobalt API instance URL"
  - `aiSummaryEndpoint` → "AI summary endpoint URL"
  - `aiSummaryProvider` → "AI summary provider"
- `extension/popup.js` — `buildSchemaOverviewKeyRow` consults
  `entry.labelKey` first (trimmed-non-empty guard) and falls back
  to the v4.28.0 humaniser. The tooltip surfaces the raw storage
  key plus, when present, the `descriptionKey` text so power
  users see both.
- `tests/hardening.test.js` — 4 new v4.40.0 regressions covering
  the override branch in popup, brand-name canary markers in the
  schema, a defensive non-empty-string parser canary across every
  override in the schema, and a freeze/round-trip canary on the
  `downloadCobaltInstance` entry.
- `tests/hardening.test.js` — the v4.28.0 label-resolution
  invariant test is rewritten as fragment matches so both v4.28.0
  and v4.40.0 implementations satisfy it.

### Why

The humaniser is great for the bulk of the 354-key schema but
loses precision on brand names — "Download cobalt instance"
reads worse than "Cobalt API instance URL", and "Ai summary
endpoint" looks like a typo. A lightweight per-entry override
field gives the popup precise labels for the ~10–20 brand /
endpoint settings without paying for full i18n yet (the upcoming
i18n pass can hang real translations off the same field).

### Verification

- 498 tests pass (was 494; +4 override regressions, +0 from the
  v4.28.0 rewrite).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.40.0.

## [4.39.0] - 2026-05-21 - profile-badge integration in the schema overview

Closes carry-forward item #7. `github-full`-gated entries in the
popup schema overview now display a small "github-full" badge so
users immediately understand that the toggle is a no-op until
`githubFullProfile=true`.

### Added

- `extension/popup.js` — `popupState._policyProfile` caches a
  single `createPolicyProfile()` instance. `ensurePolicyProfile()`
  is idempotent and seeded from `renderSchemaOverview()` so the
  per-row badge check doesn't rebuild the resolver on every call.
- `extension/popup.js` — `buildSchemaOverviewKeyRow` branches on
  `entry.profile === 'github-full'` and appends a
  `.so-key-profile-badge.so-key-profile-gated` chip with a tooltip
  explaining the gate when the effective profile is store-safe.
- `extension/popup.css` — `.so-key-profile-badge` declared at the
  house-style 4 px backdrop radius (no pill backdrops) with an
  amber tone so it reads as informational, not warning.
- `tests/hardening.test.js` — 5 new v4.39.0 regressions: badge
  branch is wired, resolver is cached + seeded before rows
  render, CSS uses sub-8 px radius, ≥1 schema entry still carries
  `profile: 'github-full'` (the badge has live coverage), and the
  policy-profile module still exports the two functions the badge
  consumes.

### Why

The v4.7.0 `policy-profile.js` resolver shipped without a popup
surface; users had no way to know that flipping a Cobalt or
BYO-API-key toggle did nothing under the default store-safe
profile. The badge resolves that confusion at the row level and
reuses the resolver from the existing core module — no new
profile logic.

### Verification

- 494 tests pass (was 489; +5 profile-badge regressions).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.39.0.

## [4.38.0] - 2026-05-21 - feature-peel batch (wave-8 CSS-only quintet)

Picks the v5.1.x feature-peel work back up after the selector-pack
arc closed. Five wave-8 CSS-only features
(`hideNotificationButton`, `noFrostedGlass`, `hideLatestPosts`,
`disableMiniPlayer`, `nyanCatProgressBar`) move into
`extension/features/wave-8-css/index.js`.

### Added

- `extension/features/wave-8-css/index.js` exposing five pure
  builders. The `nyanCatProgressBar` builder ships the multi-rule
  CSS + `@keyframes ytkit-nyan-rainbow` block.
- `extension/ytkit.js` — the five `cssFeature()` callsites now
  delegate via `globalThis.YTKitFeatures.wave8Css.*` with the
  inline literal preserved as a byte-identical fallback for
  userscript / module-unavailable contexts.
- `extension/manifest.json` — both ISOLATED content-script blocks
  load `features/wave-8-css/index.js` before `ytkit.js`.
- `sync-userscript.js` — `V5_BUNDLE_MODULES` extended with the new
  module so the userscript build inlines it.
- `tests/hardening.test.js` — 5 new v4.38.0 regressions: module
  exports five named builders, helper output matches the inline
  fallback (marker substring), monolith callsite uses the
  delegation chain (catches accidental literal-reversion),
  manifest pack-before-ytkit load order, `V5_BUNDLE_MODULES`
  parity. The v4.20.0 bundle-order canary picks up the new
  entry in the expected list.

### Why

The wave-8 quintet was the next-cheapest peel after the selector
pack split: zero parameters, contiguous in the monolith,
identical injection pattern. Centralising the CSS strings + their
parity guards makes a future redesign (e.g. updating
`nyanCatProgressBar`'s palette) a one-file edit instead of an
inline literal hunt, and gives the upcoming Astra control-center
"feature preview" surface a single import surface for the same
CSS.

### Verification

- 489 tests pass (was 484; +5 wave-8 feature-peel regressions).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.38.0.

## [4.37.0] - 2026-05-21 - v5.1.0 #7: selector-pack migration COMPLETE (final batch — live-chat trio)

Final batch of the v5.1.0 selector-pack migration. The three
live-chat surfaces — `liveChatFrame`, `liveChat`,
`liveChatPlaceholder` — move out of `INLINE_SURFACES`, which is
now an empty object literal: **every surface lives in its own
pack file**. Carry-forward item #1 closes.

### Added

- `extension/core/selector-packs/liveChatFrame.js`,
  `liveChat.js`, `liveChatPlaceholder.js`. All three carry
  `needsFreshCapture: true` and `lastVerified: null` because the
  current MHTML captures don't preserve the live-chat iframe
  contents. The `captureEvidence` field references
  `ROADMAP.md#live-chat-iframe-capture-workflow` so the popup
  health surface can link to the spec for the next capture pass.

### Changed

- `extension/core/selectors.js` — `INLINE_SURFACES` is now `{}`.
  The merge logic stays: any future diagnostic / temporary surface
  can be declared inline without writing a pack file, and packs
  still override inline entries when both exist.
- `extension/manifest.json` — 26 pack files load before
  `core/selectors.js`. `tests/core-foundation.test.js` mirrors the
  manifest order.

### Added (tests)

- `tests/hardening.test.js` — 5 new v4.37.0 regressions: pack-file
  existence + the live-chat needsFreshCapture invariant, registry
  origin + needsFreshCapture round-trip, an `INLINE_SURFACES = {}`
  canary that fails loudly if anyone adds an inline surface back
  without a paired pack file, a global manifest-vs-disk parity
  check (every pack file on disk must appear in both ISOLATED
  content_scripts blocks), and a surface-count parity check
  (pack-file count + 2 aliases = SurfaceSelectorMap size).
- `tests/hardening.test.js` — the v4.31.0 inline-still-resolves
  canary is rewritten as an "every-surface-comes-from-a-pack"
  spot-check (one surface from each of the 7 batches must carry
  capture evidence).

### Why

The v5.1.0 selector-pack split is the entry point for the rest
of v5.1.x: per-surface rollback, per-pack capture provenance, and
the path to the live-chat iframe capture workflow. Closing
INLINE_SURFACES out today means the next selector-related slice
can be "add a fresh capture for liveChat" rather than "first
finish the migration."

Roadmap: carry-forward item #1 moves to `[x]`. The live-chat
fresh capture is now an explicit v5.1.x follow-up rather than a
prerequisite.

### Verification

- 484 tests pass (was 479; +5 final-batch regressions).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.37.0.

## [4.36.0] - 2026-05-21 - v5.1.0 #6: selector-pack file split (batch 6 — misc)

Sixth batch of the v5.1.0 selector-pack migration. Five surfaces
move out of `INLINE_SURFACES`: `settingsOverlay` (Astra-owned),
`profile` + `channelProfile` (alias), `notifications`, `media`.

### Added

- `extension/core/selector-packs/settingsOverlay.js` (uses
  `extension/ytkit.js#createControlCenter` as `captureEvidence`
  because the surface is Astra-owned, not YouTube-owned),
  `profile.js` (covers the `channelProfile` alias too),
  `notifications.js`, `media.js`.
- `extension/manifest.json` — 23 pack files load before
  `core/selectors.js`.
- `tests/core-foundation.test.js` — vm loader seeds the 23 packs.
- `tests/hardening.test.js` — 5 new v4.36.0 regressions covering
  pack-file schema, registry-vs-inline origin, profile/
  channelProfile spine parity, the Astra-owned evidence
  convention for `settingsOverlay`, and manifest load order.

### Verification

- 479 tests pass (was 474; +5 misc-batch regressions).
- `npm run check` clean.
- `node sync-userscript.js` + `node build-extension.js` green at
  v4.36.0.

## [4.35.0] - 2026-05-21 - v5.1.0 #5: selector-pack file split (batch 5 — engagement)

Fifth batch of the v5.1.0 selector-pack migration. The three
engagement surfaces — `comments`, `commentComposer`,
`engagementPanels` — move out of `INLINE_SURFACES`.

### Added

- `extension/core/selector-packs/comments.js` (keeps both old and
  new comment-shape selectors during the A/B rollout),
  `commentComposer.js`, `engagementPanels.js`.
- `extension/manifest.json` — 19 pack files load before
  `core/selectors.js`.
- `tests/core-foundation.test.js` — vm loader seeds the 19 packs.
- `tests/hardening.test.js` — 4 new v4.35.0 regressions including
  a parity check that the comments pack keeps both `ytd-comment-
  view-model` and `ytd-comment-renderer` in the selector chain.

### Verification

- 474 tests pass (was 470; +4 engagement regressions).
- `npm run check` clean.
- `node sync-userscript.js` and `node build-extension.js` green
  at v4.35.0.

## [4.34.0] - 2026-05-21 - v5.1.0 #4: selector-pack file split (batch 4 — player-chrome + sidebar + modals)

Fourth batch of the v5.1.0 selector-pack migration. Four surfaces —
`playerChrome`, `playerSettings`, `sidebar`, `modals` — move out of
`INLINE_SURFACES`.

### Added

- `extension/core/selector-packs/playerChrome.js`,
  `extension/core/selector-packs/playerSettings.js`,
  `extension/core/selector-packs/sidebar.js`,
  `extension/core/selector-packs/modals.js`. The `playerChrome`
  pack inlines a comment explaining why `needsFreshCapture` stays
  `false` despite the upcoming liquid-glass redesign — flipping
  the flag would change `selector-health.js` summary counts and
  belongs in a slice paired with the actual fresh capture.
- `extension/manifest.json` — both ISOLATED content-script blocks
  now load all 16 pack files before `core/selectors.js`.
- `tests/core-foundation.test.js` — vm loader now seeds the 16
  pack files.
- `tests/hardening.test.js` — 4 new v4.34.0 regressions covering
  pack-file schema, registry-vs-inline origin, the
  legacy + Delhi/new-player fallback bundle on `playerChrome`,
  and manifest pack-before-selectors load order. The
  inline-still-resolves canary now uses the next batch
  (comments / commentComposer / engagementPanels) as the probe.

### Verification

- 470 tests pass (was 466; +4 player-chrome regressions).
- `npm run check` clean.
- `node sync-userscript.js` re-bundles v5.0.0 modules at v4.34.0.
- `node build-extension.js` emits Chrome ZIP/CRX + Firefox ZIP/XPI
  at v4.34.0.

## [4.33.0] - 2026-05-21 - v5.1.0 #3: selector-pack file split (batch 3 — watch-shell)

Third batch of the v5.1.0 selector-pack migration. The four watch-
shell surfaces — `watch`, `relatedSidebar`, `player`, `mainVideo` —
move out of `INLINE_SURFACES` into per-surface files under
`core/selector-packs/`.

### Added

- `extension/core/selector-packs/watch.js`,
  `extension/core/selector-packs/relatedSidebar.js`,
  `extension/core/selector-packs/player.js`,
  `extension/core/selector-packs/mainVideo.js` — four packs at the
  v4.31.0 schema, verified against `mhtml/WatchPage.mhtml` +
  `Worldwide Societal Collapse... - YouTube.mhtml` (2026-05-19).
  The `watch` pack notes that `ytd-watch-flexy[video-id]` is the
  best route-state probe (lifecycle-route-bridge.js observes it);
  the `player` pack warns ISOLATED-world callers to use the
  MAIN-world bridge for `window.movie_player`.
- `extension/manifest.json` — both ISOLATED content-script blocks
  now load all 12 pack files before `core/selectors.js`.
- `tests/core-foundation.test.js` — vm loader now seeds the 12
  pack files.
- `tests/hardening.test.js` — 4 new v4.33.0 regressions and the
  v4.31.0 inline-still-resolves canary is repointed to
  `playerChrome` (the next-batch unmigrated probe).

### Verification

- 466 tests pass (was 462; +4 watch-shell regressions).
- `npm run check` clean.
- `node sync-userscript.js` re-bundles v5.0.0 modules at v4.33.0.
- `node build-extension.js` emits Chrome ZIP/CRX + Firefox ZIP/XPI
  at v4.33.0.

## [4.32.0] - 2026-05-21 - v5.1.0 #2: selector-pack file split (batch 2 — feed-shell)

Second batch of the v5.1.0 selector-pack migration. The four
feed-shell surfaces — `feed`, `feedCard`, `thumbnail`, `shortsShelf` —
move out of `INLINE_SURFACES` in `core/selectors.js` into
per-surface files under `core/selector-packs/`. Each pack carries
its own `captureEvidence` + `lastVerified` (2026-05-19, against
the YouTube / Subscriptions / Worldwide-Societal-Collapse captures).

### Added

- `extension/core/selector-packs/feed.js`,
  `extension/core/selector-packs/feedCard.js`,
  `extension/core/selector-packs/thumbnail.js`,
  `extension/core/selector-packs/shortsShelf.js` — four packs
  following the v4.31.0 schema. The `feed` pack notes the
  filter-chip recycling gotcha (added nodes only); the `feedCard`
  pack keeps both the old `ytd-rich-item-renderer` and the new
  `yt-lockup-view-model` shapes; the `shortsShelf` pack keeps the
  URL-anchored `a[href^="/shorts"]` selector first because the
  shelf wrapper class churns constantly.
- `extension/manifest.json` — both ISOLATED content-script blocks
  now load all 8 pack files before `core/selectors.js`.
- `tests/core-foundation.test.js` — vm loader now seeds the 8
  pack files (was 4) so the foundation `surface selector map`
  assertion still sees every promoted surface.
- `tests/hardening.test.js` — 4 new v4.32.0 regressions:
  pack-file existence + schema, feed-shell surfaces now come from
  the registry (verified by checking `captureEvidence.length >= 1`),
  the pre-peel selectors round-trip byte-stably, manifest pack-
  before-selectors load order. The shared `loadSelectorPackContext`
  helper now discovers pack files from disk so future batches
  don't require updating the test setup block.
- `tests/hardening.test.js` — the v4.31.0 "inline surfaces still
  resolve" test now checks the still-inline surfaces (watch /
  player / comments / liveChat) and uses `watch` as the
  un-packed-yet probe for `getSurfaceSelectorEntry` defaults.

### Why

The v4.31.0 entry-point ships the infrastructure; v4.32.0 proves
the pattern scales by migrating the next four surfaces with zero
selector changes. The feed-shell is the right second batch
because the existing selector-regression fixtures
(`yt-home.tokens.txt`, `yt-watch.tokens.txt`) already exercise it
heavily — any regression in the resolver would surface
immediately.

### Verification

- 462 tests pass (was 458; +4 feed-shell regressions).
- `npm run check` clean.
- `node sync-userscript.js` re-bundles v5.0.0 modules at v4.32.0.
- `node build-extension.js` emits Chrome ZIP/CRX + Firefox ZIP/XPI
  at v4.32.0.

## [4.31.0] - 2026-05-21 - v5.1.0 #1: versioned selector-pack file split (batch 1)

First batch of the v5.1.0 selector-pack migration. Four shell
surfaces move out of `extension/core/selectors.js` and into
`extension/core/selector-packs/<surface>.js` files. Each pack file
owns one surface (or a tightly aliased pair) and declares capture
provenance + last-verified date next to the selectors, so the
popup health surface can ground "miss rate 3.4%" in "verified
against 4 captures on 2026-05-19" instead of just a live counter.

### Added

- `extension/core/selector-packs/appShell.js`,
  `extension/core/selector-packs/nav.js` (covers the `masthead`
  alias), `extension/core/selector-packs/search.js`,
  `extension/core/selector-packs/leftNav.js` — four pack files
  declaring `{ surface, stable, fallback, captureEvidence,
  lastVerified, highChurn, needsFreshCapture, notes }`. Each pack
  is an idempotent IIFE that registers itself into
  `globalThis.YTKitCore.SurfacePackRegistry` and bails on
  re-registration (Firefox hot-reload / userscript safety).
- `extension/core/selectors.js` — `freezeEntry()` extended to
  preserve `captureEvidence` (frozen array) and `lastVerified`
  (ISO date string or null). The inline 28-entry map is now
  `INLINE_SURFACES` (24 entries — first batch peeled out), and
  `SurfaceSelectorMap` is built from `INLINE_SURFACES` + every
  registered pack. Packs win when both define a surface so a future
  pack file can override a stale inline entry without editing
  `selectors.js`. `getSurfaceSelectorEntry()` now exposes
  `captureEvidence` (defaults to `[]`) and `lastVerified`
  (defaults to `null`) so consumers can iterate without a guard.
- `extension/manifest.json` — both ISOLATED content-script blocks
  load every selector pack BEFORE `core/selectors.js` so the pack
  registry is populated when the map is built.
- `tests/core-foundation.test.js` — the foundation test now loads
  the pack files in front of `selectors.js`, matching manifest
  order, so the existing `surface selector map promotes roadmap
  surfaces` assertion continues to see appShell / nav / search /
  leftNav after they peeled out of the inline map.
- `tests/hardening.test.js` — 7 new regressions: pack-file
  existence + schema-field declaration, registry duck-type +
  population, nav/masthead spine parity, manifest pack-before-
  selectors load order, `freezeEntry` preserves capture provenance,
  inline surfaces still resolve after the refactor, and
  `getSurfaceSelectorEntry` exposes the new fields with the right
  defaults on un-migrated surfaces.

### Changed

- `extension/core/selectors.js` no longer hard-codes the appShell /
  nav / masthead / search / leftNav entries — they live next to
  their captures in `selector-packs/`. Net change ≈ -65 / +28 lines.

### Why

The v4.8.0 `selector-health.js` surface already shows live miss
rates, but a high miss rate against a surface verified yesterday
is very different from a high miss rate against a surface last
captured in 2024. Co-locating capture provenance with the
selectors makes that distinction trivially answerable from the
popup. The split also makes per-surface rollback feasible: when
YouTube ships a masthead refactor, the diff lands inside
`selector-packs/nav.js` instead of a 700-line catch-all.

Roadmap milestone: `ROADMAP.md` carry-forward item #1 enters
`[~]` with the next three batches (feed / watch / engagement)
named as the remaining v5.1.0 work.

### Verification

- 458 tests pass (was 451; +7 selector-pack regressions).
- `npm run check` clean (syntax / versions / i18n / settings /
  lint / a11y / contrast).
- `node sync-userscript.js` re-bundles the v5.0.0 modules at
  v4.31.0; the userscript path keeps the inline selectors map
  (the pack split is extension-only — userscript selectors are
  inlined in the monolith already and not routed through the
  registry).
- `node build-extension.js` emits Chrome ZIP/CRX + Firefox ZIP/XPI
  at v4.31.0.

## [4.30.0] - 2026-05-21 - v5.0.0 foundation arc closed (documentation tag)

No code changes from v4.29.0 — version bump + documentation tag
declaring the v5.0.0 foundation arc effectively complete. Every
acceptance-criterion item in `ROADMAP.md` under v5.0.0 is now
either checked or marked partial with the specific remaining work
explicitly named so v5.1+ can start cleanly.

### Cumulative scoreboard

| | |
|---|---:|
| Versions shipped | 26 (v4.5.3 → v4.30.0) |
| Tests added | +136 (315 → 451) |
| New `extension/core/` modules | 7 (settings-schema, feature-lifecycle, policy-profile, selector-health, data-flow, toast, lifecycle-route-bridge) |
| Feature carve-outs from monolith | 4 modules covering 10 feature blocks |
| User-visible popup surfaces added | 4 (data-flow panel, schema category overview, per-key boolean+number+string editor, Privacy quick-toggle group) |
| Schema editor coverage | ~340 of 354 schema keys directly editable from the popup |
| Userscript bundle | 11 v5.0.0 core modules auto-bundled by `sync-userscript.js` |
| Open question resolved | Ctrl+Shift+Y keyboard shortcut retired (v4.5.3) |
| `npm run check` + `npm test` + `node build-extension.js` | Green at every step |

### Why a documentation tag

`ROADMAP.md` v5.0.0 acceptance criteria evolved across the session.
A standalone tag commit gives a clean reference point future
sessions can cite when starting v5.1+ work, and matches the
v4.30.0 binary artifacts shipped in `build/`.

## [4.29.0] - 2026-05-21 - v5.0.0 foundation #24: persist popup expansion across opens

Final UX polish on the schema-overview surface. Categories the user
has open survive popup close + reopen via a new
`ytkit_popup_schema_overview_expanded` storage key.

### Added

- `extension/popup.js` — `SCHEMA_OVERVIEW_EXPANDED_KEY` storage
  constant + `persistSchemaOverviewExpanded()` /
  `restoreSchemaOverviewExpanded()` async helpers routing through
  the existing `storageGet` / `storageSet` wrappers. Persist
  serialises the in-memory `Set` to a string `Array`. Restore
  rejects non-Array stored values and filters entries to safe
  strings (length 1-63) so a corrupted store can't blow up the UI
  with a million open categories.
- `extension/popup.js` — init flow now awaits
  `restoreSchemaOverviewExpanded()` BEFORE the first
  `renderSchemaOverview()` call, so the popup opens with the user's
  last expansion already applied. The click handler dispatches
  `void persistSchemaOverviewExpanded()` fire-and-forget after
  every toggle.
- `tests/hardening.test.js` — 5 new regressions: storage key
  constant declared, persist + restore helpers route through
  storageGet/storageSet, restore guards against malformed values
  (non-array + non-string-entry + length filter), click handler
  fires the persist promise, and the init flow restores BEFORE
  the first render.

### Why

The schema overview is now the popup's primary edit surface for
~340 of 354 schema keys. Forcing every category to re-collapse
between popup opens punished users who edit one area repeatedly
(e.g. tweaking SponsorBlock toggles or video-filter sliders). The
persistence layer is minimal — one storage key, two functions, a
filter that bounds restore-side input — and the popup keeps
working unchanged if persistence fails.

## [4.28.0] - 2026-05-21 - v5.0.0 foundation #23: humanizeSettingKey + popup label upgrade

Generic deterministic fallback labeller for every schema entry. Users
no longer see raw camelCase keys in the schema overview — the popup
now displays "Custom progress bar color" instead of
"customProgressBarColor", with the raw key still surfaced as a
tooltip for support workflows.

### Added

- `extension/core/settings-schema.js` — `humanizeSettingKey(rawKey)`
  helper. Strips leading underscores, splits on camel-case
  boundaries (allowing digits on the left so `vp9Codec` →
  `VP9 codec`), keeps letter↔digit pairs together so embedded
  digit short-forms (`h264`, `vp9`, `av1`, `mv3`) round-trip
  cleanly through a `HUMANISE_SHORT_FORMS` Set with ~50 entries
  (general short-forms + Astra Deck-specific ones: `vvf`, `sbcat`,
  `dw`). Defensive on `null` / `undefined` / `''`.
- `extension/popup.js` — schema-overview key-row label now resolves
  through `window.__YTKIT_SETTINGS_SCHEMA__.humanizeSettingKey` when
  available, falling back to the raw key when the schema module
  didn't load. The raw key remains accessible via `label.title` so
  users filing support tickets can still cite it.
- `tests/hardening.test.js` — 6 new regressions: helper exports,
  camel-case split + first-letter capitalisation, short-form
  acronyms (VVF, AI, API, DW, CSS, RSS), leading-underscore strip +
  null/undefined safety, digit-run handling (VP9, AV1), and popup
  wiring (humanizer resolved through the schema namespace, raw key
  preserved as tooltip).

### Why

The label backfill carry-forward from the previous session called
for adding `labelKey`/`descriptionKey` per schema entry plus 708
new i18n keys. A deterministic humaniser sidesteps that:
- ≈340 of 354 entries get a reasonable English label "for free".
- The 14 array+object entries still show their raw key (the in-page
  workspace owns editing).
- A future labelKey override field can stack on top — present the
  i18n string when set, fall back to `humanizeSettingKey(key)`
  otherwise.
- No 708 stub i18n keys to maintain across 10 locales.

## [4.27.0] - 2026-05-21 - v5.0.0 foundation #22: string-type editor (incl. auto color picker)

Extends the v4.24.0 / v4.26.0 schema-overview editor to strings.
Most string-typed entries get a compact text input; entries whose
default value matches a hex-colour shape (`#RGB` / `#RRGGBB` /
`#RRGGBBAA`) auto-upgrade to a native `<input type="color">`
picker.

### Added

- `extension/popup.js` — string-type branch in
  `buildSchemaOverviewKeyRow`. `looksHex` regex detects hex-coloured
  defaults so the colour picker swaps in automatically. For color
  inputs, the schema's short-form `#RGB` is mirrored into the
  6-digit form that `input[type=color]` requires (so e.g.
  `customProgressBarColor: "#ff0000"` and `selectionColor: "#2dd36f"`
  both render as native pickers). Empty-value short-circuit, equal-
  value short-circuit, and `writeSetting` persistence path mirror
  the v4.26.0 number branch.
- `extension/popup.css` — `.so-key-text` (mono text field) and
  `.so-key-color` (native picker chrome stripped — appearance: none
  plus per-vendor `::-webkit-color-swatch` + `::-moz-color-swatch`
  rules). Both use the house-style 6 px radius.
- `tests/hardening.test.js` — 5 new regressions: the input element
  branches by type, persist short-circuits when unchanged, color
  inputs coerce short-hex into the 6-digit form, CSS surface
  declared with sub-8 px radii, and a canary asserting the schema
  declares ≥30 string-typed entries (≥3 hex-coloured) so both
  editor branches have live coverage.

### Why

After v4.26.0 the popup let users edit booleans + numbers in
place, but string-typed entries (44 in the schema, including
custom colours, AI provider/endpoint configs, content-filter
keywords, locale codes, etc.) still required a trip through the
in-page workspace. v4.27.0 closes that gap. The colour-picker
auto-detection means `customProgressBarColor`, `selectionColor`,
`subStyleColor`, `subStyleBgColor`, and any future hex-default
string just works — no schema annotation required.

## [4.26.0] - 2026-05-21 - v5.0.0 foundation #21: number-type inline editor in schema overview

Extends the v4.24.0 schema-overview per-key editor to number types.
Roughly 22 number-typed schema entries (blueLightIntensity,
videosPerRow, vvfBrightness, subStyleFontSize, etc.) are now
editable directly from the popup via a compact `<input type="number">`
field instead of just showing as read-only badges.

### Added

- `extension/popup.js` — number-type branch in
  `buildSchemaOverviewKeyRow`. Creates an `<input type="number">`
  seeded with the schema default as placeholder + the live value
  pre-filled. Persists on both `change` (Enter / native commit)
  and `blur` (tab-away) so any commit surface a user expects works.
  Validates with `Number.isFinite` before persist; empty input
  short-circuits so users can clear the field without nuking the
  prior value. Routes through `writeSetting` so the existing
  chained-Promise serialisation applies.
- `extension/popup.css` — `.so-key-number` styles: monospace,
  square 6 px backdrop, right-aligned tabular-nums, native spinner
  buttons stripped (Chrome + Firefox) to keep the dense layout
  clean.
- `tests/hardening.test.js` — 4 new regressions: input element
  shape + `change`/`blur` wiring + placeholder, persist routes
  through `writeSetting` with `Number.isFinite` and empty-input
  guards, CSS surface declared with sub-8 px radius and spinner
  kill on both webkit pseudo-elements, and a canary asserting the
  schema declares at least 20 user-visible number-typed entries so
  this editor has real coverage.

### Why

After v4.24.0 the popup let users toggle ~264 booleans but still
sent them to the in-page workspace for any numeric tweak (blue-
light intensity, video filter strength, subtitle font size).
v4.26.0 closes that gap with a minimal editor surface — no
slider yet (sliders need declared min/max in the schema, which is
a follow-up), but a `<input type="number">` covers the common case
and trusts the user to enter a sensible value. The remaining
type editors (string, array, object) will land in subsequent
slices.

## [4.25.0] - 2026-05-21 - v5.0.0 foundation #20: schema-overview search integration

The popup's existing `#q` filter input now drives the schema
overview too. Typing a search term filters categories to those
containing matching keys, force-expands matching categories, and
filters the per-key sub-list to just the matches.

### Added

- `extension/popup.js` — `renderSchemaOverview()` now reads
  `q.value` into a normalised term. Inline `matchEntry(entry)`
  helper checks both the storage key and the category name (so
  searching for `subtitle` finds the seven subtitles keys via key
  prefix; searching for `downloads` finds every downloads-category
  key via category name).
- `extension/popup.js` — `q.addEventListener('input', …)` debounced
  handler now also calls `renderSchemaOverview()` after `render()`,
  so both surfaces stay in sync at the same 120 ms cadence.
- `tests/hardening.test.js` — 5 new regressions: term normalisation,
  matchEntry's key + category branches, zero-match categories
  hidden, term-match force-expands the row, input handler refreshes
  both surfaces, and a smoke test running the matcher against the
  live schema (subtitle ≥7, vvf ≥6, downloads ≥5, fake-term =0).

### Why

The v4.24.0 per-key editor unlocked editing for ~264 boolean keys.
Without search the user has to click through 18 categories to find
one. v4.25.0 closes that loop by reusing the existing filter input
— no extra UI surface, no extra keyboard handler, no separate state
to maintain. Force-expanding matching categories means the search
result list is one click away from being toggled instead of two.

## [4.24.0] - 2026-05-21 - v5.0.0 foundation #19: interactive category expansion + per-key edit

Promotes the v4.23.0 read-only category overview to a real editor.
Clicking a category row now expands a per-key sub-list. Boolean
keys render as toggle switches that persist directly through the
existing `writeSetting` path; non-boolean keys render a read-only
value badge with a type-aware display (the in-page workspace
remains the editing surface for non-boolean types).

### Added

- `extension/popup.js` — `schemaOverviewState.expanded` Set
  tracking which category rows are currently disclosed. The
  category head becomes a real `<button>` with `aria-expanded` so
  screen readers + keyboard activation work out of the box.
  Toggling re-renders the section while preserving open state.
- `extension/popup.js` — `buildSchemaOverviewKeyRow(entry, settings)`
  helper. Boolean entries render a `role="switch"` button bound to
  `writeSetting`; other types render a read-only badge with
  type-aware display: strings truncate at 24 chars, numbers show
  raw value, arrays show `[length]`, objects show `{keyCount}`,
  null/undefined show `—`.
- `extension/popup.css` — `.so-row-head`, `.so-key-list`,
  `.so-key-row`, `.so-key-switch`, `.so-key-value` styles. Switch
  uses 6 px radius (well under half-height of the ~15 px button
  so it stays distinctly rectangular per house style). Two-column
  grid retired in favour of a single-column flex layout — needed
  so expanded rows can grow vertically without breaking layout.
- `tests/hardening.test.js` — 5 new regressions: state Set is
  declared, head element is a real button with `aria-expanded`,
  buildSchemaOverviewKeyRow exists with the right shape (switch
  path + read-only badge path), switch radius stays ≤8 px (no
  stadium aesthetic), and writeSetting remains the single write
  entry-point for both quick-toggle + schema-overview consumers.

### Why

The v4.23.0 read-only overview made the schema visible; v4.24.0
makes it actually edit-driving. The popup is now the first place
in the product where every boolean schema key can be toggled —
the existing QUICK_TOGGLES surface only exposed 18 keys; this
slice opens up access to all 264 boolean keys (the remaining ~90
non-boolean entries stay read-only for now since rendering each
type's right editor — color picker, textarea, multi-select — is
a follow-up). Keeping `writeSetting` as the single write entry-
point means the existing `chrome.storage.onChanged` listener fans
the update out to all open tabs identically.

## [4.23.0] - 2026-05-21 - v5.0.0 foundation #18: schema-driven category overview in popup

Closes the visible end of the v5.0.0 schema-consumption arc: the
popup now ships a read-only "Settings overview" surface that
displays every settings-schema category with live enabled-vs-total
counts. Collapsed by default; uses native `<details>` for
accessibility; reactive to `chrome.storage.onChanged`.

### Added

- `extension/popup.html` — `<details class="schema-overview">`
  surface between the storage stats and the data-flow panel. Native
  collapsible disclosure pattern; defaults closed so first-time
  openers see only the summary line.
- `extension/popup.js` — `renderSchemaOverview()` renderer + new
  `isToggleEnabled(entry, settings)` helper (mirrors the data-flow
  panel's "currently active" heuristic across booleans, strings,
  numbers, arrays, objects). Reads
  `window.__YTKIT_SETTINGS_SCHEMA__.SETTINGS_SCHEMA` (bundled in
  popup.html via the v4.12.0 core-module script tags). Wired into
  both the initial `loadSettings()` flow and the
  `chrome.storage.onChanged` reactive re-render. Non-internal
  entries only — `_`-prefixed storage state is excluded.
- `extension/popup.css` — `.schema-overview` surface styled to match
  the existing health/data-flow lanes: dense, OLED-friendly, dark
  only. Two-column grid for the per-category list keeps the popup
  height bounded even with 18 categories.
- `extension/_locales/*/messages.json` — two new i18n keys
  (`schemaOverviewEyebrow`, `schemaOverviewCountTpl` with
  `{enabled}/{total}/{categories}` placeholders). All 10 locales
  seeded with English fallbacks.
- `tests/hardening.test.js` — 5 new regressions: details surface
  exists and defaults closed, popup.js wires the renderer in three
  places (definition + init + storage.onChanged), CSS uses no pill
  backdrops, every locale defines both new keys, and the count
  template references all three placeholders.

### Why

The v5.0.0 schema has been the source of truth for risk badges
(v4.16.0) and the data-flow panel (v4.12.0). v4.23.0 generalises
the pattern with a read-only category roll-up that demonstrates
the schema is consumable for any future popup or in-page UI
surface that needs per-category state. The native `<details>`
choice keeps it discoverable without permanently adding 18 rows of
popup chrome — closed by default, opens on click for users who
want the full landscape.

## [4.22.0] - 2026-05-21 - v5.0.0 foundation #17: theme-css extends (+compactUnfixedHeader, +hideVideoEndContent)

Two more bulk peels into the existing `extension/features/theme-css/`
module, bringing the theme-css consumer count to seven.

### Added

- `extension/features/theme-css/index.js` —
  `buildCompactUnfixedHeaderCss()` (parameter-less; masthead height
  + page-manager margin trims) and `buildHideVideoEndContentCss()`
  (parameter-less; covers eight end-screen/end-card surfaces +
  `div.ytp-fullscreen-grid-stills-container`).
- `tests/hardening.test.js` — 5 new regressions covering the two
  new builders, surface coverage, monolith fallback parity
  contracts, and a roster check that pins the seven theme-css
  builders in alphabetical order.

### Changed

- `extension/ytkit.js` — `compactUnfixedHeader` and
  `hideVideoEndContent` feature blocks delegate CSS construction to
  `globalThis.YTKitFeatures.themeCss.*` when present. Inline
  byte-identical fallbacks remain for the userscript path.

## [4.21.0] - 2026-05-21 - v5.0.0 foundation #16: theme-css extends (+forceDarkEverywhere, +themeAccentColor)

Two more bulk peels into the existing `extension/features/theme-css/`
module, bringing the theme-css consumer count to five.

### Added

- `extension/features/theme-css/index.js` — two more pure CSS
  builders: `buildForceDarkEverywhereCss()` (parameter-less; emits
  the four rule blocks that drag YouTube's non-standard pages into
  dark surface tokens) and `buildAccentColorCss(settings)` (returns
  `null` for malformed hex, CSS for valid `#RGB` / `#RRGGBB` /
  `#RGBA` / `#RRGGBBAA`). Both attach to
  `globalThis.YTKitFeatures.themeCss`. The userscript bundle picks
  them up automatically on next `node sync-userscript.js`.
- `tests/hardening.test.js` — 5 new regressions: exports of the two
  new builders, force-dark four-block rule coverage, accent-color
  hex validation across all four valid hex variants + null on
  malformed input, monolith fallback parity contracts for both
  delegating consumers, and a defensive cross-file regex check.

### Changed

- `extension/ytkit.js` — `forceDarkEverywhere` and `themeAccentColor`
  feature blocks now delegate CSS construction to
  `globalThis.YTKitFeatures.themeCss.*`. Inline byte-identical
  fallbacks remain for the userscript path; tests pin each parity
  contract.

### Why

Continued monolith peel cadence. Both features are pure CSS with
no SPA coupling, no async, and tiny code surfaces — the cost of
keeping them in the monolith is higher than the cost of the
delegating consumer wrapper. The accent-color hex validation regex
now also has a hardening test pinning it across both the module
and the inline fallback so a future hand-edit can't silently allow
a malformed hex string.

## [4.20.0] - 2026-05-21 - v5.0.0 foundation #15: userscript bundle of core modules

Closes a major v5.0.0 gap: the YTKit.user.js userscript no longer
lags the MV3 extension on the v5.0.0 core surface. The 11 modules
that have shipped since v4.6.0 (settings-schema, feature-lifecycle,
policy-profile, selector-health, data-flow, toast, the four feature
peels, and the lifecycle-route-bridge) are now auto-bundled into
the userscript inside its outer IIFE.

### Added

- `YTKit.user.js` — `// ── BEGIN v5.0.0 bundled core modules ──` /
  `// ── END v5.0.0 bundled core modules ──` marker pair right
  inside the outer IIFE. Auto-bundled content sits between them.
- `sync-userscript.js` — `V5_BUNDLE_MODULES` constant declaring the
  11 module file paths plus a regex-driven replace pass that swaps
  the bundle contents on every sync. Modules are concatenated in
  the same order the manifest's content_scripts entries declare,
  so the userscript runs them in the same dependency-correct
  sequence as the extension. Each bundled module preserves its
  IIFE wrapper and its `globalThis.YTKitCore` /
  `globalThis.YTKitFeatures` attachment.
- `tests/hardening.test.js` — 5 new regressions: marker presence,
  every module appears by name in the bundle, every module's
  unique signature appears verbatim (parity fingerprint), bundle
  order matches V5_BUNDLE_MODULES, and the V5_BUNDLE_MODULES list
  is declared in sync-userscript.js so an auditor can read both
  side-by-side.

### Why

The v5.0.0 architecture has been growing on the extension side
since v4.6.0 (settings-schema). The userscript was stuck at
metadata-sync only — none of the new core modules ran there. The
v4.20.0 bundling pass closes that gap with a single hand-curated
`V5_BUNDLE_MODULES` array, leaving the per-module IIFE shape
untouched so the runtime semantics are byte-identical between
the two artifacts. A future bulk peel that introduces a new core
module just appends to the array; the test suite immediately
flags any drift.

## [4.19.0] - 2026-05-21 - v5.0.0 foundation #14: bundled theme-css peels (×3)

Bundled fourth, fifth, and sixth feature peels in a single slice.
Three small CSS-only theme features in `extension/ytkit.js` share
the same pattern (read one or two schema settings, return a pure
CSS string), so they cohabit nicely in a single
`extension/features/theme-css/index.js` module.

### Added

- `extension/features/theme-css/index.js` — three pure CSS builders:
  * `buildProgressBarCss(settings)` — returns `null` for the default
    `#ff0000` colour (preserving the monolith's short-circuit-skip
    behaviour) and a two-rule string for any other valid hex.
  * `buildSelectionColorCss(settings)` — emits `::selection` +
    `::-moz-selection` rules. Falls back to the schema default
    `#2dd36f` for malformed input.
  * `buildGrayscaleThumbnailsCss()` — parameter-less constant; covers
    four feed renderers + their `:hover` restore variants.
  All three attach to `globalThis.YTKitFeatures.themeCss`.
- `tests/hardening.test.js` — 7 new regressions covering the helper
  exports, default-skip behaviour, swatch rule emission for a custom
  colour, both selection pseudo-elements + fallback, four-renderer
  coverage + hover restore, monolith parity contracts for all three
  consumers, and the manifest load order.

### Changed

- `extension/ytkit.js` — three feature blocks (`customProgressBarColor`,
  `customSelectionColor`, `grayscaleThumbnails`) now delegate CSS
  construction to `globalThis.YTKitFeatures.themeCss.*`. Inline
  byte-identical fallbacks remain for the userscript path; tests pin
  each parity contract.
- `extension/manifest.json` — both ISOLATED-world content_script
  entries load `features/theme-css/index.js` immediately after
  `features/blue-light-filter/index.js`.

### Why

The pattern is the same as v4.13.0 / v4.17.0 / v4.18.0 but applied
in bulk: three small features with no SPA coupling, no async, no
inter-feature dependencies. Bundling them in a single module keeps
the `features/` directory tree from sprawling for the long tail of
"two-line CSS rule" features, and demonstrates the peel pattern
scales — the next bulk peel can group more.

## [4.18.0] - 2026-05-21 - v5.0.0 foundation #13: third feature peel (blueLightFilter)

Third feature peel from `extension/ytkit.js`, following the v4.13.0
subtitles and v4.17.0 video-filters pattern. The warm-tint RGBA
computation for the blueLightFilter overlay moves into its own
pure module; the DOM overlay element and lifecycle stay in the
monolith.

### Added

- `extension/features/blue-light-filter/index.js` — pure helper
  `buildBlueLightRgba(settings)` plus a frozen `OVERLAY_FIXED_CSS`
  declaring the overlay element's static styles (position, z-index,
  mix-blend-mode, etc.) so a future popup preview swatch can render
  the same overlay without duplicating CSS rules. Clamps
  `blueLightIntensity` to the schema-declared 10..80 range and falls
  back to the default 30 for missing/non-numeric input.
- `tests/hardening.test.js` — 5 new regressions covering module
  surface exports, byte-stable RGBA output at three intensity
  values, out-of-range clamping, the monolith fallback parity
  contract (delegates + inline-formula matches), and the manifest
  load order (after `features/video-filters`, before `ytkit.js`).

### Changed

- `extension/ytkit.js` — `blueLightFilter._apply()` delegates the
  tint RGBA computation to
  `globalThis.YTKitFeatures.blueLightFilter.buildBlueLightRgba`
  when present. Inline fallback formula preserved unchanged for the
  userscript path; tests pin the parity contract.
- `extension/manifest.json` — both ISOLATED-world content_script
  entries load `features/blue-light-filter/index.js` immediately
  after `features/video-filters/index.js`.

### Why

Third installment of the monolith carve-out per ROADMAP.md v5.0.0.
Blue-light filtering is a self-contained CSS computation that
benefits the most from being testable in isolation — the JS-float
precision in the alpha channel (`0.1 * 0.35 → 0.034999999999999996`)
is now locked by a test, so any future "tidy-up" refactor that
silently rounds the precision will also be flagged at build time.

## [4.17.0] - 2026-05-21 - v5.0.0 foundation #12: second feature peel (video-filters)

Second feature carve-out from `extension/ytkit.js`, mirroring the
v4.13.0 subtitles pattern. The video-element CSS-`filter` chain
moves into `extension/features/video-filters/`; the monolith's
`videoVisualFilters._apply()` delegates to the module when present
with a byte-identical inline fallback for the userscript path.

### Added

- `extension/features/video-filters/index.js` — pure helpers
  `buildVideoFilterCss(settings)` and `isVideoFilterIdentity(settings)`,
  plus a frozen `featureSpec` ready for the v4.7.0 lifecycle
  adoption. Exports `FIELD_BOUNDS` (declared min/max/fallback for
  each of the six filter channels: brightness/contrast/saturation
  0-200%, hue −180-180 deg, grayscale/sepia 0-100%) so a future
  popup or in-page slider UI consumes the same clamping rules.
  Attaches to `globalThis.YTKitFeatures.videoFilters`.
- `tests/hardening.test.js` — 6 new regressions: module surface
  exports, default-value six-channel chain, out-of-range clamping
  per channel, `isVideoFilterIdentity` truthiness for all-default
  settings, monolith fallback parity contract, and the manifest
  load order (video-filters after subtitles, before ytkit.js).

### Changed

- `extension/ytkit.js` — `videoVisualFilters._apply()` delegates CSS
  construction to `globalThis.YTKitFeatures.videoFilters.buildVideoFilterCss`
  when present. Inline byte-identical fallback preserved for the
  single-file userscript path; tests pin parity. The DOM-touching
  `_togglePanel` (slider UI) stays in the monolith for now.
- `extension/manifest.json` — both ISOLATED-world content_script
  entries load `features/video-filters/index.js` immediately after
  `features/subtitles/index.js`. Full v4.17.0 load order:
  `navigation → feature-lifecycle → policy-profile → selector-health
  → data-flow → toast → features/subtitles → features/video-filters
  → lifecycle-route-bridge → ytkit.js`.

### Why

`ROADMAP.md` v5.0.0 calls for incremental extraction of feature
modules from the monolith. After the v4.13.0 subtitles peel proved
the pure-helper pattern, video-filters is the next obvious
candidate: 7 schema keys (1 master + 6 sub), no SPA coupling, no
MAIN bridge, no async, and the CSS construction is a deterministic
pure function. Splitting it lets the popup eventually render a
visual-filter preview directly without round-tripping through the
content script.

## [4.16.0] - 2026-05-21 - v5.0.0 foundation #11: schema-driven risk badges on popup toggles

First popup surface that consumes the v4.6.0 settings-schema risk
metadata beyond the data-flow panel. Each quick-toggle row whose
schema entry declares a non-`safe` risk band now renders a small
square-cornered badge next to the toggle name, coloured by risk
tone. Tooltip explains the meaning. Reuses the v4.12.0 data-flow
palette so the popup speaks one consistent visual language for
"what this touches".

### Added

- `extension/popup.js` — `createSchemaRiskBadge(key)` helper that
  consults `window.YTKitCore.findSettingEntry(key)` and returns a
  rendered `<span>` for `api` / `local-companion` / `experimental` /
  `store-risk` entries (and `null` for `safe` entries or when the
  schema module didn't load). Tooltip + `aria-label` carry a
  human-readable risk description with sensible English fallbacks.
- `extension/popup.js` — toggle-row renderer now wraps the name in
  a flex `.name-row` container and appends the risk badge to its
  right when present.
- `extension/popup.css` — `.toggle-risk-badge` base style + four
  tone-specific variants (`toggle-risk-api`, `-local-companion`,
  `-experimental`, `-store-risk`). Square-cornered 4 px radius per
  house style, monospace label, semi-transparent tinted background
  + matching border. No pill / stadium backdrops.
- `tests/hardening.test.js` — 4 new regressions: helper exists +
  consults the schema, render() inserts the badge in the name-row,
  CSS declares all four tone variants with a 4 px radius (no pill
  backdrop check), and a canary test pinning the current
  three-toggle non-safe surface (sponsorBlock + deArrow +
  transcriptViewer).

### Why

The risk metadata has been in the schema since v4.6.0 but only the
data-flow panel consumed it. Surfacing the same risk band on the
quick-toggle row puts the trust signal exactly where users make the
toggle decision — no extra clicks, no extra panel. The canary test
on the non-safe surface keeps the badge subset small + meaningful:
adding a new quick toggle that talks to an external service forces
a deliberate update to the test, preventing accidental visual
clutter.

## [4.15.0] - 2026-05-21 - v5.0.0 foundation #10: privacy quick-toggles in popup

Makes the v4.12.0 data-flow panel and the v4.7.0 store-safe vs
github-full profile machinery discoverable without leaving the
popup. Three new quick toggles + a new "Privacy" group rendered
with a padlock glyph (square-cornered, house-style — no pill
backdrop).

### Added

- `extension/popup.js` — `QUICK_TOGGLES` array gains three entries
  in a new `Privacy` group:
  * `privacyDataFlowPanel` — Show every API origin Astra Deck can
    contact (drives the v4.12.0 popup data-flow section).
  * `safeStoreProfile` — Hide github-full toggles + scrub keys on
    export.
  * `githubFullProfile` — Unlock github-full toggles (e.g. Cobalt,
    AI keys).
- `extension/popup.js` — `GROUP_ICONS['Privacy']` declares the
  padlock glyph (rect body + U-shaped shackle path) so the
  Privacy group renders consistently alongside the other five
  groups.
- `tests/hardening.test.js` — 4 new regressions: QUICK_TOGGLES
  contains the three new keys under group `Privacy`, GROUP_ICONS
  defines the padlock body+shackle, popup.html advertises the new
  total (18 controls), and every new toggle key exists in the
  v4.6.0 schema.

### Changed

- `extension/popup.html` — `#resultsState` text bumped from "15
  controls" to "18 controls" to match the new total. (The actual
  count is computed dynamically by popup.js; the static HTML value
  is just the initial-paint placeholder before the JS hydrates.)

### Why

The v4.12.0 popup data-flow panel was schema-gated on
`privacyDataFlowPanel` but there was no popup-level way to flip
that setting — users had to open the in-page workspace overlay to
enable it. Adding the three privacy toggles to the popup makes the
v5.0.0 trust surface a one-click discovery from the toolbar.
`safeStoreProfile` is already on by default (declared in the
schema), so the "Privacy: 1/3 enabled" badge gives users a quick
read on their effective profile.

## [4.14.0] - 2026-05-21 - v5.0.0 foundation #9: core/toast.js helper peel

Second peel pass from the `extension/ytkit.js` monolith. The pure
tone classification + brand-palette RGB + badge label helpers move
into their own module so the popup, the in-monolith
`showToast`/`dismissToast`, and any future feature/UI module share
one semantic-color contract. DOM-touching code (the actual toast
element + dismiss timer + focus restoration) stays in the monolith
for now — the v5.0.0 "single live region" overlay primitive will
land alongside the categorised settings panel.

### Added

- `extension/core/toast.js` — `inferToastTone`, `getToastRgb`,
  `getToastBadgeLabel`, plus a new `getToastAriaDefaults` helper
  that returns `{role,ariaLive}` per tone (error → assertive
  alert; everything else → polite status). Brand palette anchors
  documented in source: `#35c77f` success / `#ff7480` error /
  `#ffbe7a` warning / `#6aa9ff` info / `#8b97ab` neutral. Attaches
  to `globalThis.YTKitCore.toast` so ytkit.js can pick it up.
- `tests/hardening.test.js` — 6 new regressions covering the full
  helper surface, deterministic tone mapping (case-insensitive +
  graceful default), brand-palette parity between module and
  monolith fallback, ARIA defaults, the byte-stable inline-
  fallback parity check, and the manifest load-order invariant
  (toast.js after data-flow.js, before features/subtitles + ytkit.js).

### Changed

- `extension/ytkit.js` — `inferToastTone`, `getToastRgb`, and
  `getToastBadgeLabel` now delegate to the new `core/toast.js`
  module when `globalThis.YTKitCore.toast` is present. Inline
  byte-identical fallbacks remain for the userscript path that
  doesn't load the module yet; tests pin the parity contract.
- `extension/manifest.json` — both ISOLATED-world content_script
  entries load `core/toast.js` between `core/data-flow.js` and
  `features/subtitles/index.js`. Full v4.14.0 load order:
  `navigation → feature-lifecycle → policy-profile → selector-health
  → data-flow → toast → features/subtitles → lifecycle-route-bridge
  → ytkit.js`.

### Why

`ROADMAP.md` v5.0.0 calls for `toast.js` extraction as a v5.0.0
follow-up. Splitting the pure helpers first (and leaving the DOM
surface in place) mirrors the v4.13.0 subtitles peel pattern — pure
logic out, lifecycle/DOM adoption next, monolith inline finally
retired in a follow-up. The new `getToastAriaDefaults` helper is the
seed for the v5.0.0 "single live region" overlay primitive that the
popup data-flow panel + the in-monolith toast will eventually share.

## [4.13.0] - 2026-05-21 - v5.0.0 foundation #8: first feature peel (subtitles)

First feature carve-out from the 43k-line `extension/ytkit.js`
monolith. The subtitle-caption styling CSS construction moves into
its own pure, testable module at `extension/features/subtitles/`; the
monolith's `subtitleStyling._apply()` now delegates to the module
when available, with a byte-identical inline fallback for the
single-file userscript path.

### Added

- `extension/features/subtitles/index.js` — pure helper
  `buildSubtitleCss(settings)` plus a frozen `featureSpec` ready for
  the v4.7.0 lifecycle adoption. Exports `FONT_FAMILY_MAP` so future
  consumers (popup font-family picker) reuse the same lookup. Defends
  against malformed input: clamps `subStyleFontSize` to 50-300,
  `subStyleBgOpacity` to 0-100, `subStyleBottomOffset` to 0-90; rejects
  non-hex colour input with a documented fallback to white/black; expands
  `#RGB` short-form hex to `#RRGGBB`. Attaches to
  `globalThis.YTKitFeatures.subtitles` so ytkit.js can pick it up.
- `tests/hardening.test.js` — 6 new regressions: module surface
  exports, deterministic byte-stable CSS output for a known input,
  clamping of out-of-range numeric inputs (no throw, sane fallback),
  text-shadow on/off, the monolith fallback contract, and the
  manifest content_script load order (subtitles module before
  `ytkit.js`, after the `core/*` modules).

### Changed

- `extension/ytkit.js` — `subtitleStyling._apply()` now delegates CSS
  construction to `globalThis.YTKitFeatures.subtitles.buildSubtitleCss`
  when present. The inline fallback (used by the single-file
  userscript that doesn't load the module yet) is preserved unchanged
  and exercised in parallel by tests. The fallback comment documents
  the "MUST stay byte-identical" parity contract so future hand-edits
  to either copy surface as test failures.
- `extension/manifest.json` — both ISOLATED-world content_script
  entries now load `features/subtitles/index.js` immediately before
  `ytkit.js`, after the `core/*` module run.

### Why

`ROADMAP.md` v5.0.0 calls for incremental extraction of feature
modules from the monolith by category. The `subtitles` category is
the smallest, most isolated of the 18 categories: 8 schema keys, no
SPA coupling, no MAIN-world bridge, no observer or async dependency,
no inter-feature conflicts. That makes it the ideal pilot for the
peel pattern — pure logic out first, lifecycle adoption next, monolith
inline finally retired in a follow-up slice when every consumer is
known to ship the module. The byte-stable fallback contract keeps the
userscript path working unchanged while the extension path migrates.

## [4.12.0] - 2026-05-21 - v5.0.0 foundation #7: popup data-flow panel UI

First user-visible slice of the v5.0.0 architecture. The popup now
ships a "Data flow" section that renders `core/data-flow.js`'s
catalogue against the live settings bag — every external origin
Astra Deck can reach, with risk-tone dot + origin + purpose +
profile/creds/risk/driver metadata, and an active/idle flag based
on whether any driving feature is currently enabled. Schema-gated
on `privacyDataFlowPanel` (off by default); when the user enables
it from the in-page workspace, the popup re-renders reactively via
`chrome.storage.onChanged`.

### Added

- `extension/popup.html` — `<section class="data-flow">` between the
  selector-health and health-banner surfaces. Three new bundled
  `<script>` tags load `core/settings-schema.js` +
  `core/policy-profile.js` + `core/data-flow.js` before `popup.js`
  so the popup can call `window.YTKitCore.createDataFlow()` directly
  without a content-script round-trip.
- `extension/popup.js` — `dataFlowSection`/`dataFlowSummary`/
  `dataFlowList` refs + `renderDataFlowPanel()` renderer +
  `appendDataFlowMeta()` helper. Wired into both the initial
  `loadSettings()` flow and the `chrome.storage.onChanged` reactive
  re-render. Section stays hidden whenever
  `privacyDataFlowPanel !== true` or the core factory failed to load
  (CSP regression guard).
- `extension/popup.css` — `.data-flow` surface styled to match the
  selector-health visual lane: dense, OLED-friendly, dark only. Per
  the project house style, no pill/stadium backdrops — chips use 8 px
  radius rectangles; the only `border-radius: 50%` is on a 6 px round
  risk-tone indicator dot. Five risk-band colour classes
  (`df-risk-safe`/`api`/`local`/`experimental`/`store-risk`).
- `extension/_locales/{en,de,es,fr,it,ja,ko,pt_BR,ru,zh_CN}/messages.json` —
  9 new i18n keys (`dataFlowTitle`, `dataFlowNote`,
  `dataFlowSummaryTpl`, `dataFlowActive`, `dataFlowInactive`,
  `dataFlowProfile`, `dataFlowCreds`, `dataFlowRisk`,
  `dataFlowDriver`). All 10 locales seeded with English fallbacks;
  translation is a follow-up.
- `tests/hardening.test.js` — 7 new regressions: popup.html hooks
  present + default-hidden, popup.html bundles the three core
  modules before popup.js, popup.js wires refs + gate + factory
  resolution, renderer is called at init + on storage.onChanged, all
  10 locales define all 9 keys, popup.css uses no stadium backdrops,
  and a new background.js ↔ data-flow store-safe origin parity gate
  (ensures `ALLOWED_FETCH_ORIGINS` never drifts from the catalogue
  for store-safe origins).

### Why

`ROADMAP.md` v5.0.0/v5.8.0 calls for a data-flow panel that makes
trust visible: per-API origin + purpose + credentials policy +
disable action. The v4.10.0 slice landed the data side; v4.12.0
lands the popup surface that consumes it. Locking in the
background↔catalogue origin parity at test time means a future
contributor can't silently add a new fetch target without also
listing it in the data-flow catalogue (or vice versa).

## [4.11.0] - 2026-05-21 - v5.0.0 foundation #6: schema ↔ data-flow coverage gate + Cobalt entry

Closes the conceptual gap between the v4.6.0 settings-schema risk
metadata and the v4.10.0 data-flow origin catalogue. Every
`api` / `local-companion` schema entry must now be reachable from
some origin entry (directly or via parent-feature inheritance), and
the test suite fails loudly if a developer adds a new external API
toggle without listing its origin.

### Added

- `extension/core/data-flow.js` — `PARENT_FEATURE` inheritance map.
  Sub-toggles inherit their driving status from a parent feature
  (e.g. `sbCat_sponsor` inherits from `sponsorBlock`, `daReplaceTitles`
  inherits from `deArrow`, `aiSummaryProvider` inherits from
  `aiVideoSummary`, the Astra Downloader sub-knobs inherit from
  `showLocalDownloadButton`, etc.). One intentional exemption:
  `subscriptionAiTags` uses Chrome's built-in Summarizer (no remote
  origin) and stays absent from the catalogue.
- `extension/core/data-flow.js` — new `https://api.cobalt.tools`
  catalogue entry. The Cobalt fallback origin was previously absent
  from the catalogue despite being referenced by `downloadCobaltFallback`
  / `downloadCobaltInstance`. Profile `github-full`, credentialsPolicy
  `no-cookies`, riskBand `api`.
- `extension/core/data-flow.js` — `findCoverageGaps(schema, catalogue,
  parentMap)` helper used by the new hardening test. Returns the list
  of api/local-companion schema entries that are NOT covered after
  applying the parent-feature inheritance map.
- `tests/hardening.test.js` — 3 new regressions: zero-coverage-gap
  invariant against the live schema, presence of the Cobalt catalogue
  entry, and PARENT_FEATURE keys-and-parents all exist in the schema.

### Why

A 21-key drift was found at audit time before this slice landed —
the data-flow catalogue described 5 driving features per origin while
the schema declared 21 keys with risk `api`/`local-companion`. Most
were legitimate sub-toggles (SponsorBlock categories, DeArrow shape
options, AI summary knobs) that the catalogue intentionally leaves
implicit, but one — `downloadCobaltFallback` — was a real missing
origin. The PARENT_FEATURE map makes the sub-toggle convention
explicit, the new origin closes the genuine gap, and the test ensures
the next time someone adds `xyzApi` they're prompted to either add a
catalogue entry or extend PARENT_FEATURE.

The Cobalt origin remains absent from `manifest.json` host_permissions
because the github-full profile build (the only profile that can
enable `downloadCobaltFallback`) is expected to ship with extended
permissions; pinning it into the store-safe manifest would
unnecessarily flag CWS/AMO review.

## [4.10.0] - 2026-05-21 - v5.0.0 foundation #5: data-flow origin catalogue

Fifth foundation slice. Pure-data backing for the v5.0.0/v5.8.0
data-flow panel: enumerates every external origin Astra Deck can
contact, why each origin matters, which feature toggles drive
requests to it, the credentials policy the background proxy applies,
and the profile under which the origin is available.

### Added

- `extension/core/data-flow.js` — `createDataFlow()` factory plus a
  frozen `ORIGIN_CATALOGUE`. Each catalogue entry declares
  `{ origin, purpose, requiredByFeatures, credentialsPolicy
    ('no-cookies' | 'byo-key' | 'local-loopback' | 'none'), profile,
    riskBand }`. Helpers: `getOrigins(settings)` resolves
  `manifestPermission` against the live host_permissions list and
  flips `currentlyActive` based on whether any driving feature is
  enabled; `getActiveOrigins`, `getOriginsByProfile`, and
  `summarise` give the popup panel everything it needs to render
  per-origin chips + counts in one read. Catalogue covers YouTube,
  ytimg, SponsorBlock/DeArrow, RYD, Reddit, OpenAI/Anthropic/Gemini
  BYO endpoints, Ollama loopback, and the Astra Downloader port
  range.
- `tests/hardening.test.js` — 6 new regressions: catalogue shape
  validation, `currentlyActive` toggle flips, manifest-permission
  resolution, summarise partition rollup, the store-safe ⊂ manifest
  host_permissions coverage gate, and the manifest load-order
  invariant.

### Changed

- `extension/manifest.json` — both ISOLATED-world content_script
  entries now load `core/data-flow.js` between
  `core/selector-health.js` and `core/lifecycle-route-bridge.js`.
  Full v4.10.0 load order:
  `navigation → feature-lifecycle → policy-profile → selector-health
  → data-flow → lifecycle-route-bridge → ytkit.js`.

### Why

`ROADMAP.md` v5.0.0 calls for a data-flow panel v1 with per-API
origin, purpose, credentials policy, cache TTL, and disable action.
The data side lands first so the popup work (next slice) can render
against a stable contract. The store-safe⊂manifest gate test pins
a hard invariant: every catalogued store-safe origin must already
appear in `host_permissions`, preventing a future profile-mix
mistake where a "store-safe" feature silently relies on a
github-full-gated origin.

## [4.9.0] - 2026-05-21 - v5.0.0 foundation #4: lifecycle ↔ navigation bridge

Fourth foundation slice. Wires `core/navigation.js`'s SPA-navigation
event stream into the lifecycle singleton, so every
yt-navigate-finish / yt-page-data-updated / popstate / watch-flexy
mutation auto-increments the lifecycle route token exactly once. Any
future feature adopting the lifecycle contract can now drop stale
async results trivially by comparing `ctx.routeToken` at start vs.
completion.

### Added

- `extension/core/lifecycle-route-bridge.js` — idempotent
  self-installing bridge module. Auto-runs on production load (after
  `core/navigation.js` + `core/feature-lifecycle.js` per the
  manifest order); degrades to a no-op if either dependency is
  absent. Exposes the named `installLifecycleRouteBridge(options)`
  so tests can wire mock `addNavigateRule` + `getLifecycle`
  providers. Lifecycle-side throws are caught + logged through
  `logger.warn` so a misbehaving lifecycle implementation can never
  break navigation processing.
- `tests/hardening.test.js` — 4 new regressions: no-op-without-deps
  guard, route-token bump-per-navigate, error-swallow with
  diagnostic log, and the manifest load-order invariant
  (bridge AFTER navigation + lifecycle, BEFORE `ytkit.js`).

### Changed

- `extension/manifest.json` — both ISOLATED-world content_script
  entries now load `core/lifecycle-route-bridge.js` immediately
  before `ytkit.js`. The relative load order
  `navigation → feature-lifecycle → policy-profile → selector-health
  → lifecycle-route-bridge → ytkit.js` is pinned by tests.

### Why

`ROADMAP.md` v5.0.0 calls for a route-aware observer coordinator
"that layers on the lifecycle route token". The route-token API
already lives on the lifecycle (v4.7.0); the bridge is the missing
glue that makes navigation events actually drive that counter. With
the bridge in place, every v5.1+ feature peel can rely on a single
authoritative route token without each feature subscribing to
navigation independently.

## [4.8.0] - 2026-05-21 - v5.0.0/v5.1.0 foundation #3: selector-health + lifecycle singleton

Third slice of the v5.0.0 architecture and the first taste of the
v5.1.0 selector-health system. Adds a small consumer module on top of
the already-rich per-selector telemetry inside `extension/core/selectors.js`,
plus a lazy singleton accessor on the lifecycle so future feature
modules can adopt the contract without each one minting its own
instance. No existing feature is rewired yet.

### Added

- `extension/core/selector-health.js` — `createSelectorHealth()`
  factory plus stand-alone helpers `summarizeSelectorHealth`,
  `rankSelectorProblems`, `formatSelectorCopyReport`. The summarizer
  aggregates hits/misses/errors/high-churn/needs-fresh-capture
  counts across all surfaces; the ranker returns worst-N by failure
  rate while filtering out zero-attempt (untested) surfaces; the
  copy-report formatter emits a deterministic ASCII text bundle
  ready for the popup "Copy selector report" button (product
  version + exported-at + browserUA header, per-surface flags,
  closing investigation guidance, "no problem surfaces" short-form
  when the tracker is clean). The module never mutates
  `core/selectors.js` state — read-only by design so tests can feed
  synthetic snapshots.
- `extension/core/feature-lifecycle.js` — `getLifecycle()` lazy
  singleton accessor and `_resetLifecycleForTests()` helper. First
  caller seeds the instance with `options`; every later caller in
  the same world receives the same instance. The original
  `createLifecycle()` factory remains exposed for tests and for
  callers that need an isolated instance.
- `tests/hardening.test.js` — 7 new regressions: summarize counts,
  rank exclusion of zero-attempt surfaces, copy-report header +
  problem-surface formatting, "no problems" clean-form copy report,
  pluggable provider wiring, singleton stability, and the manifest
  selector-health load-order invariant.

### Changed

- `extension/manifest.json` — both ISOLATED-world content_script
  entries now load `core/selector-health.js` between
  `core/policy-profile.js` and `ytkit.js`. The relative load order
  is pinned by a new invariant test.

### Why

`ROADMAP.md` v5.1.0 calls for a runtime selector-health dashboard
that promotes capture-fixture failures into user-visible
diagnostics. The data is already there in `core/selectors.js`; the
v4.8.0 slice supplies the read-side façade the popup diagnostics
panel + the future "Copy report" affordance will consume, with
zero risk to the well-tested selectors module. The lifecycle
singleton lands now (rather than in v4.7.0) because the first real
consumer — the SPA-navigation bridge that bumps the route token —
will be staged on top of `core/navigation.js` in the next slice.

## [4.7.0] - 2026-05-21 - v5.0.0 foundation #2: feature-lifecycle + policy-profile

Second slice of the v5.0.0 architecture from ROADMAP.md. Adds the
two clean-room contract modules new features build on top of: a
deterministic lifecycle wrapper around init/apply/destroy + the
store-safe vs github-full policy resolver. No existing feature is
rewired yet — these are additive primitives that v5.1+ features will
adopt incrementally.

### Added

- `extension/core/feature-lifecycle.js` — `createLifecycle()`
  factory wrapping the ROADMAP contract: `defineFeature({ id,
  category, init, apply, destroy })` validates required hooks and
  the category enum, `start()` provisions a fresh AbortController
  whose `signal` is exposed on the context object, `apply()` hot-
  applies a new value without teardown, `destroy()` aborts the
  controller first then runs teardown (best-effort — sub-failures
  are captured on `lastError` so callers can always tear down). A
  monotonic route token bumps on `notifyRouteChange()` so async work
  can drop stale results after an SPA navigation. `snapshot()`
  returns per-feature health for diagnostics.
- `extension/core/policy-profile.js` — `createPolicyProfile()`
  factory built on the v4.6.0 schema. `resolveEffectiveProfile()`
  maps `{safeStoreProfile, githubFullProfile}` to `'store-safe'` or
  `'github-full'` with the "most permissive wins" rule. Helpers:
  `isEntryAllowedInProfile`, `isKeyAllowedInProfile`,
  `filterSettingsForProfile`, `shouldScrubKey`,
  `buildExportSnapshot`, `countByProfile`. The scrubber removes any
  key matching `/apiKey$/i` or `/token$/i` from exports and reverts
  github-full-only entries to their schema defaults when exporting
  under store-safe.
- `tests/hardening.test.js` — 11 new regressions pinning lifecycle
  hook validation, category gate, AbortController lifecycle, route-
  token monotonicity, best-effort destroy, profile resolution,
  github-full hiding under store-safe, secret scrubbing, export
  defaulting, count partitioning, and the manifest content_script
  load-order invariant.

### Changed

- `extension/manifest.json` — both ISOLATED-world content_script
  entries (top-level + all-frame live-chat) now load
  `core/settings-schema.js`, `core/feature-lifecycle.js`, and
  `core/policy-profile.js` immediately before `ytkit.js`. The
  manifest invariant test pins the relative load order so a future
  refactor can't accidentally promote `ytkit.js` ahead of the
  contract modules.

### Why

`ROADMAP.md` v5.0.0 calls for `feature-lifecycle.js` and explicit
store-safe/full profile gates before any large feature carve-out
ships. Building them as clean-room modules (with no current
consumers) lets the upcoming feature-by-feature peel from
`ytkit.js`'s 43k-line monolith adopt them incrementally without
breaking the existing surface area. `toast.js` extraction is
deferred — `showToast()` inside `ytkit.js` already meets the
single-live-region contract; carving it into a module is a
non-functional refactor best done alongside the first feature peel.

## [4.6.0] - 2026-05-21 - v5.0.0 foundation #1: settings-schema single source of truth

First slice of the v5.0.0 architecture refactor from `ROADMAP.md`. The
schema is now the canonical reference for every Astra Deck setting,
with build-time + test-time gates that prevent default-value drift
between `extension/core/settings-schema.js`, `extension/ytkit.js`'s
in-code defaults, and `extension/default-settings.json`.

### Added

- `extension/core/settings-schema.js` — 354-entry frozen array. Every
  entry carries `key`, `category`, `type`, `defaultValue`, `risk`,
  `profile`, `scope`, `vehicle`, `immediateApply`, `destroyRequired`,
  `internal`, and `since`. Helpers exported: `buildDefaultsFromSchema`,
  `getKeysByCategory`, `findSettingEntry`, `isInternalSettingKey`,
  `getStoreSafeKeys`, `getGithubFullKeys`. Loadable as both a Node
  CommonJS module and an ISOLATED-world classic content script.
- `scripts/check-settings.js` — schema parity gate. Validates exports,
  per-entry metadata against the canonical enums, no-duplicate keys,
  schema↔default-settings key set parity, insertion-order match, and
  byte-for-byte round-trip. Hooked into `npm run check` between
  `check-i18n` and `lint`. Standalone runner is `npm run check:settings`.
- `tests/hardening.test.js` — 10 new regression tests pinning the
  schema invariants (surface exports, metadata validity, no dupes,
  key-set parity, ordering, round-trip, category coverage,
  store-safe/github-full partition, internal-key exclusion,
  findSettingEntry resolution).
- `scripts/_gen-schema.js` — one-shot generator that rebuilt the
  initial schema from `ROADMAP.md` "Full Per-Toggle Settings Schema"
  and `default-settings.json`. Retained so future ROADMAP narrative
  updates can be re-synced into the schema on demand.

### Changed

- `build-extension.js` — `writeDefaultSettingsCatalog` now emits
  `extension/default-settings.json` from `buildDefaultsFromSchema()`.
  The legacy `extractDefaultsFromSource(ytkitSource)` extractor still
  runs as a belt-and-braces drift check; any disagreement between the
  schema and `ytkit.js`'s in-code `defaults:` block fails the build
  with a per-key drift report.

### Why

`ROADMAP.md` v5.0.0 phase mandates the settings-schema foundation as
the first deliverable: every other v5 phase (selector packs,
content-filter superset, player superset, watch-page tabs, etc.) needs
a single source of truth for category/risk/profile/scope metadata. The
brace-balanced extractor from `ytkit.js` was workable but fragile;
flipping to a frozen array module unblocks the categorised popup,
data-flow panel, dual-profile build, and import/export scrubbing
features queued for v5.0.0+ without piling new responsibilities onto
the 43k-line monolith.

## [4.5.3] - 2026-05-21 - Retire keyboard shortcut surface (house-style alignment)

The "no keyboard shortcuts" rule in the v5 roadmap is now enforced in
code. The only remaining activators for the Astra Deck control center
are the toolbar action button, the in-page gear icon, and the popup.

### Removed

- `extension/manifest.json` — entire `commands` block (the
  `toggle-control-center` entry with `Ctrl+Shift+Y`).
- `extension/background.js` — `chrome.commands.onCommand` listener
  plus the now-orphaned `togglePanelForTab`/`sendTabMessage` helpers
  and the `PANEL_MESSAGE.toggle` key.
- `extension/ytkit.js` — the `Ctrl+Alt+Y` in-page keydown handler, the
  `SETTINGS_SHORTCUTS` constant, the shortcut label on trigger-button
  tooltips, the shortcut badge in the panel hero, and the footer
  shortcut span. The `PANEL_MESSAGE_TYPES.toggle` handler was retired
  with the rest (the `open`/`close` messages remain in use by the
  popup).
- `extension/_locales/{en,de,es,fr,it,ja,ko,pt_BR,ru,zh_CN}/messages.json` —
  the `toggleControlCenterDesc` message key (10 locales).
- `scripts/manifest-patch.js` — the Firefox `Ctrl+Shift+Y → Ctrl+Alt+Y`
  rebind. There is no longer a shortcut to collide with Firefox's
  reserved "Show Downloads" binding.

### Tests

- `tests/hardening.test.js` — replaced the Firefox-rebind regression
  test with a positive assertion that neither the Chrome nor the
  Firefox-patched manifest declares a `commands` block. Updated the
  i18n required-keys test to assert `toggleControlCenterDesc` is
  absent, and dropped the `__MSG_toggleControlCenterDesc__` reference
  assertion from the manifest-i18n test.

### Rationale

The roadmap and `CLAUDE.md` both mandate "no keyboard shortcuts" — every
competitor shortcut feature must become a visible button, pointer
gesture, context-menu action, or popup control. The previous shortcut
was the single in-tree violation; clearing it unblocks v5.0.0
settings-schema work (which gates on the toolbar action button being
the visible activator).

## [4.5.2] - 2026-05-21 - Extreme audit hardening: permissions, audits, CI, pytest, uninstall cleanup

Deep reliability/security pass on top of v4.5.1. No feature expansion;
the work tightens trust boundaries, validation coverage, and release
ergonomics.

### Security and safety

- Removed wildcard `http://localhost:*` extension host permissions.
  The downloader/Ollama local bridge now exposes only explicit
  `http://127.0.0.1:*` permission surfaces, matching the background
  allowlist's existing DNS-rebinding-resistant stance.
- Replaced popup selector-health metric HTML assembly with DOM/text-node
  construction so diagnostic text cannot become an `innerHTML` sink.
- Hardened Astra Downloader frozen-app uninstall cleanup: delayed
  install-dir removal now validates the install path shape and invokes
  PowerShell with `Remove-Item -LiteralPath $args[0]` instead of
  string-built shell deletion.

### Validation and developer experience

- `scripts/audit-popup-a11y.js` now parses actual popup buttons,
  validates dynamic confirmation labels, and fails on missing switch
  focus-visible, dialog, or keyboard affordances instead of printing a
  red finding while exiting successfully.
- `scripts/check-syntax.js` now recursively checks JavaScript under
  `extension/` and `scripts/`, plus root build scripts, so extracted
  core modules cannot fall outside syntax validation.
- Version drift checks now include `package-lock.json`, and
  `build-extension.js --bump` updates the lockfile's root/package entry.
  GitHub Actions delegates tag validation to `scripts/check-versions.js`
  so CI and local release checks use the same source of truth.
- Added `pytest.ini` to pin pytest-qt to PyQt6 and keep
  `python -m pytest astra_downloader` from importing PySide6 before the
  app imports PyQt6.

### Tests

- Full JS test suite: 311 -> 315 total tests.
- Python downloader tests: 80 -> 82 with uninstall cleanup coverage.
- Full validation for this cut: `npm test`, `npm run check`,
  `python -m pytest astra_downloader`, `npm audit --omit=dev`, and the
  release build path.

## [4.5.1] - 2026-05-20 — architectural regression pins

Test-and-extraction patch on top of v4.5.0. No user-visible behavior
change. Three additions:

### Modularization

- **ICONS + createSVG extracted to `extension/core/icons.js`**. The 404-line inline block (createSVG SVG
  builder + `_S` default-stroke const + ICONS object with ~80 named
  factories) moves out of ytkit.js into a focused core module.
  Library has zero ytkit.js-internal deps — only
  `document.createElementNS` — so the extraction is a plain
  top-level move; 29 call sites continue to consume the same
  `ICONS.foo()` invocation via a local-variable rebinding. Defensive
  fallback if the core module fails to load: `createSVG` becomes an
  empty-SVG stub, `ICONS` becomes a Proxy that returns the same stub
  for any key — page stays renderable with blank icon slots instead
  of NPE-ing.
- `extension/ytkit.js` LOC: **43,407 → 43,081 (-326)**. Cumulative
  since start: **44,264 → 43,081 = -1,183 LOC
  (-2.67%)**. Six core modules extracted to date.

### Architectural regression pins

- **SponsorBlock event-driven scheduling pinned**. Upstream
  SponsorBlock v6.1.5 (2026-04-21) fixed "segments not skipping when
  video is scrolled away" — their old path was gated on a `requestAnimationFrame`
  loop that stops firing when YouTube hides the off-screen video via
  IntersectionObserver. Our SB has always used event-driven setTimeout
  boundaries (scheduled from playing / seeked / ratechange), viewport-
  agnostic. 3 new regression tests fail loudly if a future refactor
  re-introduces rAF-gating on `_checkSkip` / `_scheduleNextSkip`, OR
  drops the paused-video early-return, OR consults IntersectionObserver /
  getBoundingClientRect / offsetParent.
- **DeArrow selector chain resilience pinned**. Upstream
  DeArrow shipped v2.3.4 / v2.3.5 / v2.3.6 in April 2026 — three rapid
  patches for YouTube swapping one CSS class at a time on title /
  thumbnail nodes. Our DeArrow uses durable primitives: custom-element
  tags, stable IDs, attribute matchers, our own "da"-prefixed marker
  classes. 2 new regression tests pin the resilient surface and
  catch any future attempt to lean on a hashed/obfuscated class
  name (via regex on `.Mb_xyz_abc123`-shaped patterns).

### Tests

- 299 → **311** JS tests (+12 across the three extended additions:
  N21 SponsorBlock scheduling + viewport-agnostic + paused-pause;
  N22 DeArrow selector resilience + marker namespacing;
  N23-extended ICONS factory API surface + shape coverage +
  options handling + manifest load order + inline-removal guard).
- All existing tests stay green. Python 80/80 unchanged.

## [4.5.0] - 2026-05-20 — -#5 + yt-dlp 2026 external runtime surface

Rolling-release cut bundling / / / hardening
plus three deliveries: TranscriptService + StorageManager
extractions out of the 44k-line ytkit.js monolith,
and the AstraDownloader v1.5.0 Deno-runtime presence probe that surfaces
yt-dlp's 2026 external-JS-runtime dependency on the wire so field
installs see a "Deno: missing" pill instead of silent YouTube
download failures.

### Modularization

- **TranscriptService extracted to `extension/core/transcript-service.js`**. The 446-line inline `const TranscriptService = {…}`
  block moved into a focused factory module exposing
  `globalThis.YTKitCore.createTranscriptService`. The 5-method failover
  pipeline (window-variable → Innertube → HTML fetch → captionTracks
  regex → DOM panel scrape) is preserved verbatim. The factory accepts
  lazy accessor callbacks for `getVideoId` / `showToast` /
  `getPlayerResponseGlobal` / `extensionFetchJson` / `extensionFetchText`
  so the module decouples from the ytkit.js feature monolith. Unit
  tests pass plain mocks. Defensive fallback in ytkit.js if the core
  module ever fails to load: a stub that logs a clear error and
  returns failure results for all 4 call sites.
- **StorageManager cache+debounce extracted to
  `extension/core/storage-manager.js`**. The
  99-line inline `const StorageManager = {…}` block moved into a
  focused factory module exposing
  `globalThis.YTKitCore.createStorageCache` (renamed to disambiguate
  from `core/storage.js`, which is the LOW-LEVEL `chrome.storage`
  wrapper — the two used to share a name). The factory passes
  `storageRead` / `storageWrite` / `storageWriteMany` /
  `flushPendingStorageWrites` / `getSaveDebounceMs` accessors so the
  module is unit-testable with plain backing-store mocks. The
  `_initUnloadFlush()` hook is WeakSet-guarded so the `beforeunload`
  and `yt-navigate-start` listeners only register once per window —
  was previously a memory-leak risk on re-instantiation.
- **`extension/ytkit.js` LOC** dropped 43,924 → 43,407 across N18 +
  N19 (-517 lines net; the inline implementations were 446 + 99 = 545
  lines, replaced by 27 + 27 = 54 lines of factory + defensive
  fallback wrappers). Cumulative reduction: 44,264 → 43,407 = -857 lines (-1.93%). Five extractions
  shipped to date: DiagnosticLog, PredicateSandbox, VideoTypeDetector, TranscriptService, StorageManager.

### Downloads / observability

- **AstraDownloader v1.4.0 → v1.5.0** ships an external JavaScript
  runtime probe. yt-dlp `>= 2026.04` ships an external n/sig solver
  for YouTube (upstream PR #14157) and invokes an external JS runtime
  (Deno is the documented option). Field installs that auto-update
  yt-dlp.exe to a 2026.04+ build but lack Deno hit silent download
  failures. The `/health` endpoint gains a `denoRuntime` field
  `{ installed, version, path, ytdlpNeedsRuntime, advice }` —
  additive, `SERVICE_API_VERSION` stays at 2.
- **`extension/ytkit.js downloadHealthPanel`** renders a Deno pill
  next to the download button when `ytdlpNeedsRuntime` is true.
  Tone `warn` with label `missing` and install advice in the
  tooltip when Deno is absent; tone `ok` with label `v2.x.x` and
  the binary path in the tooltip when present. Pill stays hidden on
  pre-cutoff yt-dlp builds so the panel doesn't gain a dead surface
  in the field.
- **`README.md`** astra_downloader section gains a "External
  JavaScript runtime (yt-dlp 2026+)" subsection with winget + curl
  install commands.
- **Detection primitive** is `shutil.which('deno')` — no shell-out,
  no shell-injection surface. Version is parsed permissively from
  `deno --version` first-line semver.
- **Conservative cutoff**: `YTDLP_EXTERNAL_RUNTIME_CUTOFF = (2026, 4, 1)`.
  Older yt-dlp builds (the in-field-stable pre-Deno line) don't
  false-positive on a misconfigured PATH.

### UI surfaces shipped earlier in (now part of this release window)

- **Storage-quota proactive warning banner** in the toolbar popup. Renders when usage > 80% of the 10 MB
  `chrome.storage.local` ceiling. Uses the same accent-tinted warn
  styling as the existing diagnostic banners.
- **Storage corruption detector + recovery banner**. If
  `chrome.storage.local.get(null)` returns a malformed payload, the
  popup surfaces an amber banner with a clear-storage CTA. No silent
  data loss.
- **Per-context DiagnosticLog counters via `countsByCtx()`**. The ring buffer maintains O(1) bookkeeping per
  context tag (`trusted-types` / `selector-health` /
  `storage-corruption` / `settings-migration` / `console` / `window`),
  with ring-trim decrement and lazy resync from the persisted ring on
  first read. Wrong-order bug from the in-line implementation (push
  → resync → increment) fixed during extraction.
- **Popup selector-health dashboard**. Surfaces the
  DOM-shape drift detection in the popup — pills per
  surface showing live drift status. `schemaVersion 2` for the
  export.
- **`extension/popup.html` inline CSP meta tag**.
  Defense-in-depth: complements the existing manifest CSP with a
  page-level `<meta http-equiv="Content-Security-Policy">` so the
  popup is constrained even if the manifest CSP is somehow stripped.
- **MainWorld MutationObserver consolidation**. Three
  separate `MutationObserver` instances on `<html>` in
  `ytkit-main.js` consolidated into one. Reduces per-frame DOM
  observation cost.
- **TrustedHTML fallback delegation to `core/trusted-html.js`**. The inline DOMParser fallback in `ytkit.js`
  `TrustedHTML` now delegates to the shared `core.setTrustedHTML` /
  `core.toTrustedHTML` helpers when the core module is present,
  keeping ytkit.js's inline fallback only for the unit-test path.
- **bgutil-ytdlp-pot-provider stale-version notice in `/health`**. The `poTokenProvider` field gains a `stale: bool`
  + `minVersion: str` pair. Set true when the detected provider
  version compares less than `BGUTIL_POT_MIN_VERSION = "1.3.0"`.
  Extension popup health surface renders an amber "update bgutil-pot"
  pill distinct from the absence notice.

### Modularization shipped earlier in (now part of this release window)

- **DiagnosticLog extracted to `extension/core/diagnostic-log.js`**. Ring buffer + per-ctx counters now live in a
  ~170-line core module. Coupling to `appState.settings` /
  `settingsManager.save` flows through accessor callbacks.
- **PredicateSandbox extracted to `extension/core/predicate-sandbox.js`**. The custom-JS predicate evaluator and its
  PredicateError class moved into a 343-line core module. The
  sandbox uses `new Function('ctx', userCode)` against a frozen
  context — no eval, no Function constructor with arbitrary deps.
- **VideoTypeDetector extracted to `extension/core/video-type.js`**. The "is this video a Short / livestream /
  premiere / normal" heuristic moved to a 128-line core module.

### Hardening (post-v4.4.0)

- **TrustedTypes bypass repaired** in `extension/ytkit.js` AI handoff button
  and `theater-split.user.js` close button. Both were direct
  `element.innerHTML = '<svg…>'` assignments that throw under YouTube's
  strict TT CSP. Rebuilt the SVG via `createElementNS` / `appendChild`.
- **No-pill-backdrop rule** propagated across every Astra-injected CSS.
  Three sites in `ytkit.js` (volume HUD bar, sub-group chip, sub-new
  badge) and fourteen sites in `theater-split.user.js` (live badge,
  view-count badge, twelve button overrides) used `border-radius: 999px`
  and now use 4-8 px. Two new hardening tests guard against the next
  regression — `tests/hardening.test.js` "no Astra-injected CSS uses
  pill (999px) backdrops anywhere in ytkit.js" and the matching
  theater-split assertion.
- **`core/api-limiter.js clear()` no longer drops queued promises.**
  Awaiters used to hang forever when a feature destroyed its limiter
  mid-flight. Now rejects every pending task with a clear error.
- **`core/selectors.js waitForSurfaceElement` redundant timeout leak fixed.**
  Two parallel timers (the inner `core.waitForElement` and an explicit
  fallback) both ran to expiry; the fallback handle was never cleared.
- **`core/trusted-html.js setTrustedHTML` last-resort fallback hardened.**
  Replaced `element.insertAdjacentHTML('afterbegin', plainString)` (a
  TT-policed sink fed a raw string) with parsed-fragment `appendChild`,
  so we never touch a TT sink with a non-TrustedHTML value.
- **Popup import bulk-broadcast.** `extension/popup.js` used to send
  one `chrome.tabs.sendMessage` per setting key (~250 messages × open
  YouTube tabs per import). Now sends a single
  `YTKIT_SETTINGS_REPLACED` per tab; `extension/ytkit.js` routes it
  straight into `applyExternalSettingsUpdate` so feature re-init fires
  immediately without waiting for `storage.onChanged` propagation.
- **`astra_downloader._run_download` error truncation.** The branch
  that captured `error_lines[-1]` skipped the 240-char cap the fallback
  branch already applied; a yt-dlp ERROR with a Python traceback could
  round-trip unbounded to the popup. Both branches now truncate
  consistently.
- **Defensive `versionEl` null-guard** in `popup.js` — any future
  `popup.html` edit that removes `#version` would crash the popup
  bootstrap; now degrades gracefully.
- **Perf**: `popup.js` switched two hot-path size accounting sites
  from `new Blob([JSON.stringify(value)]).size` to
  `TextEncoder.encode().byteLength` (UTF-16 length × 2 fallback for
  ancient engines). Material on every popup open with multi-MB local
  storage.

### i18n / l10n

- **Locale parity restored.** Four health-save keys
  (`healthSaveAria`, `healthSaveBtn`, `statusDiagSaved`,
  `statusDiagSaveFail`) had drifted out of every non-EN locale when
  v3.23.0 shipped the Save Diagnostic feature but never propagated.
  Backfilled translations in all 9 non-EN locales
  (de / es / fr / it / ja / ko / pt_BR / ru / zh_CN). Updated
  `scripts/generate-locales.js` so re-running the generator emits the
  same translations instead of falling back to English.
- **Removed `zh_CN` orphan key** `languageEyebrow` (not present in
  EN; not referenced anywhere in code).
- **`scripts/check-i18n.js` extended** with a per-locale parity gate
  that fails CI on missing-key drift AND on orphan keys. Output now
  reports "Locale parity OK — N non-EN locales match EN key set".

### Networking

- **`extensionRequestWithRetry` honors `Retry-After`** (RFC 7231 §7.1.3 —
  delta-seconds OR HTTP-date), capped at 60 s ceiling so a hostile or
  buggy server can't park a request indefinitely. Falls back to the
  exponential schedule as a floor when the server hint is shorter.

### Dependencies

- **`brace-expansion` 5.0.5 → 5.0.6** to address GHSA-jxxr-4gwj-5jf2
  (moderate DoS via large numeric range). Dev-only — transitive through
  `eslint`.

### Tests + CI

- 258 → 299 JS tests across this arc (+41 regression assertions): api-limiter clear() reject
  behavior, pill-backdrop guard in ytkit.js + theater-split,
  direct-innerHTML-SVG detector, locale parity gate, Retry-After
  honoring, YTKIT_SETTINGS_REPLACED handler presence, DOM-shape
  drift detection + cooldown + re-entry guard + ext-internal
  channel, storage-quota banner threshold, storage-corruption
  detector trigger, per-ctx counter resync, MutationObserver
  consolidation invariants, TrustedHTML core delegation, popup
  selector-health export schema version, and the module
  extraction guards (TranscriptService API surface + load order,
  StorageManager cache semantics + idempotent unload-flush).
- ~47 → 80 Python tests for AstraDownloader: per-ctx logging
  smoke, bgutil stale-version comparator, Deno runtime probe
  parsing, runtime cutoff evaluation, wire-contract shape pins on
  `/health`.
- `npm run check` continues green across all four sub-checks
  (`scripts/check-versions.js` + `check-syntax.js` + `check-i18n.js`
  + `check-contrast.js`).

## [4.4.0] - Audit-Pass Hardening

Repo-wide audit pass — defensive hardening of security boundaries,
storage growth limits, lifecycle gaps, and UX rough edges flagged by
parallel deep-dives across `background.js`, `popup.js`, `core/*`,
`ytkit-main.js`, and `astra_downloader.py`. No new user-facing features
— this release is purely "make existing surfaces more robust."

### Security (extension)

- **DNS-rebinding hardening.** Removed every `http://localhost:*`
  allowlist entry from `ALLOWED_FETCH_ORIGINS`, `CREDENTIALED_FETCH_
  ORIGINS`, and `AUTH_HEADER_ALLOWED_ORIGINS`. Chrome ≥88 pins
  `localhost` to loopback, but Firefox still resolves it through DNS
  and a hostile network can rebind to an internal IP. `127.0.0.1` is
  loopback-literal and immune; the downloader client already prefers
  it, so the change is transparent.
- **Sender identity validation on every chrome.runtime.onMessage
  branch.** Defense-in-depth: although the manifest doesn't declare
  `externally_connectable`, every message handler now compares
  `sender.id` to `chrome.runtime.id` and rejects mismatches up front.
  Hard-stops a future regression that widens the trust boundary by
  accident.
- **Filename sanitizer blocks Unicode bidi-override and zero-width
  characters** (U+202A-E, U+2066-9, U+200B-D, U+2060, U+FEFF). Closes
  the classic `report.pdf<U+202E>exe.gpj` extension-spoof attack.
  Also strips DEL (U+007F).
- **Popup locale override validated against the bundled allowlist.**
  `isValidLocaleTag()` checks BCP-47 shape (length, charset) AND
  membership in `BUNDLED_LOCALE_SET`. Both the storage-load path and
  the dropdown-change persistence path reject anything outside the
  set so a stale or hostile `_localeOverride` value can't trigger
  an arbitrary `chrome.runtime.getURL` fetch.

### Resource bounds

- **`_pendingReveals` Set capped at 1024 entries.** Drops the oldest
  insertion when full. Defends against unbounded growth if
  `chrome.storage.session` writes repeatedly fail. Uses the new
  `_addPendingReveal()` helper.
- **`subscriptionLastVisitData` capped at 2000 channels.** Prunes by
  oldest visit timestamp when over the cap. Without this the
  "channels ever surfaced in the subscriptions feed" set grew
  monotonically.
- **`core/selectors.js` `selectorStats` Map and `emittedMisses` Set
  capped** at 512 / 1024 entries respectively. Drops the
  insertion-order-oldest entry when over cap. Prevents long-session
  memory leak from accumulating diagnostic entries per (surface,
  selector) tuple.
- **`commentFilterManager._lastRulesHash` is now an 8-char djb2-style
  digest** instead of the raw rule body. The hash is stamped onto
  every comment thread's `dataset` attribute — pinning the full rule
  text onto every DOM node was an obvious memory leak waiting to
  happen.

### Lifecycle / correctness

- **`core/registry.js` `register({replace:true})` drops orphaned
  cleanups** for the replaced feature id. Previously, re-registering
  a feature without first calling `destroy()` leaked the prior
  cleanup list onto the new feature's destroy() call, causing stale
  side-effects to fire on the new instance.
- **`videoHider` resets the PredicateSandbox circuit on every SPA
  navigate.** Matches the design-doc contract ("auto-disabled for
  the remainder of the SPA route") — without this hook a single
  noisy eval could permanently disable filters across the whole
  session.
- **`downloadHealthPanel` polls only on `/watch` AND when the tab is
  visible.** Previously it pinged the local downloader every 30 s
  from every YouTube tab regardless of route or foreground state —
  wasteful network chatter and an unnecessary keepalive for the MV3
  service worker.

### UX

- **`subscriptionGroups` new-group flow now uses an inline dialog**
  instead of `window.prompt`. The dialog is `role=dialog
  aria-modal=true`, dismisses on Esc / outside click, restores focus
  to the trigger button, and matches the Astra surface theme.
  `window.prompt` blocks the page, ships unstyled, and is deprecated
  in some contexts.

### PageTypes coverage

- **Added `MUSIC`, `EMBED`, and `LIVE_CHAT`** to `core/page.js`
  `PageTypes` with matching `isMusicHost()`, `isEmbedPath()`, and
  `isLiveChatPath()` helpers. Features that branch on page type can
  now classify these contexts cleanly without re-deriving host/path
  checks.

### Tests

- 12 new regression tests (247 → 258 total) covering every hardening
  point above: localhost drop, sender.id check, RTL filename strip,
  locale validation, _pendingReveals cap, _stampLastVisit cap,
  selector stats cap, comment-filter short hash, predicate reset on
  nav, inline group dialog (aria-modal + Esc), PageTypes coverage,
  registry replace-cleanup, and health-poll route/visibility gate.
  258/258 JS tests pass.

## [4.3.0] - AI Tags For Subscription Groups

Closes the last concrete deferred item from the v4.0.0 milestone:
optional AI tags for `subscriptionGroups`, riding on the same Chrome
built-in Summarizer used by `localAiSummary` (v3.30). No remote
fall-through; if the API isn't exposed the user gets an explicit
"enable the Chrome AI origin trial" message.

### Added (extension)

- **`subscriptionAiTags`** master toggle. Default off — gates the
  whole AI-tag surface so the chip behaves identically to v4.2.0
  when not in use.
- **`subscriptionAiTagData`** local-only storage:
  `{ groupId: { tags: string[], generatedAt: ms } }`. Tags
  sanitized to lowercase, alphanumerics + hyphens + spaces only, max
  24 chars each, capped at 8 per group to bound storage.
- **Shift+click on a group chip regenerates AI tags.** Reads up to
  40 visible card titles for channels in the group, hands them to
  `window.Summarizer` / `window.ai.summarizer` with a single
  `key-points`/`short` summarizer instance, parses the comma/newline-
  separated output, and persists the resulting tag list. The chip
  label appends the first three tags inline (`Group (N) · tag1 tag2
  tag3`); full set lives in the chip tooltip.

### Changed (extension)

- **Group chips show their stored AI tags inline** when present so
  users don't need to open a tooltip to see the topic at a glance.
  Tooltip explains the shift+click affordance for regeneration.

### Tests

- 3 new regression tests: Chrome built-in Summarizer factory check
  (no fetch / no extensionFetchJson on the AI path), persistence
  shape (`generatedAt` timestamp + 8-tag cap), and chip render +
  shift+click gate. 246/246 JS tests pass.

## [4.2.0] - Subscription Popularity + Transcript Search UI

Picks up two more deferred items from the v4.0.0 milestone: the
popularity sort for the subscription feed and a visible search UI on
top of the local IndexedDB transcript index.

### Added (extension)

- **Popularity sort for `subscriptionGroups`.** New
  `_parseCompactViewCount(text)` helper plus a `'popular'` branch in
  `_applySort` reads each card's `#metadata-line` / `aria-label`,
  parses K / M / B suffixes, and sorts by descending view count. The
  sort `<select>` now offers "Most popular (views)" as a fifth option.
- **`researchTranscriptSearchPanel`.** Adds a "Search transcripts"
  button next to the player's download button. Opens a fixed
  glass-surface panel with: a debounced search input (300 ms),
  per-result deep link (`target="_blank"`, `rel="noopener
  noreferrer"`) with title + 160-char excerpt around the matched
  phrase, footer Close button, and a danger-styled "Clear local
  index" button. All search/clear calls go through the existing
  `window.__ytkitSearchTranscripts` / `__ytkitClearTranscriptIndex`
  helpers — no new storage code path.

### Tests

- 4 new regression tests covering popularity-sort view-count parsing
  + inverted score, helper-function reuse (panel doesn't open its
  own DB connection), off-state messaging when the parent index is
  off, and destroy cleanup of button + panel + style tag.
  243/243 JS tests pass.

## [4.1.0] - Deferred-Item Follow-Ups

Picks up the two deferred items called out in the v4.0.0 milestone:
DeArrow channel override UI and the per-context quality matrix.

### Added (extension)

- **DeArrow channel overrides honored in the runtime
  (`deArrowChannelOverrides`).** Each card has its channel ID
  extracted; if `overrides[channelId].mode` is `'off'` or `'original'`,
  the runtime stamps `data-da-override` on the card and skips both
  title and thumbnail replacement before any API call fires. `mode
  === 'dearrow'` is the default — no override row in the data model
  is required.
- **DeArrow per-channel override chip (`deArrowChannelOverridesPanel`).**
  Adds a chip next to the channel name on the watch page. Click
  cycles `DeArrow → Original → Off → DeArrow`. Toast feedback per
  click; chip color tracks the active mode (purple = DeArrow,
  amber = Original, gray = Off). Re-running DeArrow on the current
  page is forced after every write so the new mode takes effect
  without a page reload.
- **Per-context quality matrix (`qualityProfileMatrix`).** Detects
  normal / theater / fullscreen / background / embed transitions via
  `fullscreenchange`, `visibilitychange`, and a `MutationObserver`
  scoped to `ytd-watch-flexy[theater]`. Writes the active context to
  `data-ytkit-quality-context` on `<html>` and the resolved quality
  string to `data-ytkit-quality-target`. Five new per-context
  settings (`qualityDefaultNormal` / `Theater` / `Fullscreen` /
  `Background` / `Embed`) default to `inherit`.
- **MAIN-world bridge reads `data-ytkit-quality-target`.** New
  `applyContextQuality()` block in `ytkit-main.js` listens to the
  attribute mutation, `loadedmetadata`, and `yt-navigate-finish` —
  calls `movie_player.setPlaybackQualityRange(target, target)` when
  a non-empty target is present. Idempotent via the
  `vid:ctx:target` key.

### Changed (extension)

- **`deArrow._processPage()` short-circuits on per-channel overrides
  before the API call.** Prevents wasted `_fetchBranding` requests
  for channels the user has explicitly excluded.

### Tests

- 5 new regression tests: override-then-fetch ordering, cycle order
  (`dearrow → original → off → dearrow`), per-context attribute
  publishing surface (fullscreenchange + visibilitychange + theater-
  attribute observer), destroy cleanup of both data attributes, and
  the MAIN-world bridge attribute filter. 240/240 JS tests pass.

## [4.0.0] - Beats Every Competitor — Milestone Release

Astra Deck v4.0.0 is the milestone marker for the v3.25 → v3.33 push.
No new features ship in 4.0.0 itself — the version bump records that
every roadmap line item across nine release waves is either shipped,
explicitly store-profile-gated, or documented as technically /
policy-bounded with the next-action follow-up.

### What landed in the v3.25 → v3.33 push

- **v3.25** Content filtering superset — predicate sandbox, comment
  filter, bulk card actions, Feed Triage profile.
- **v3.26** Player control superset — screenshot format + subtitle
  baking, expanded speed range, volume wheel, initial player state,
  loudness normalization, per-channel intro/outro.
- **v3.27** Downloads & local media library — download health pills,
  stream-links panel, Cobalt fallback (GitHub-only), history panel.
- **v3.28** Ratings + clickbait + metadata trust — Return YouTube
  Dislike with rate limiter, anti-translate audio/transcript,
  monetization indicator.
- **v3.29** Subscription manager — local groups + sort + new-since
  markers + group export/import.
- **v3.30** Research workspace — local AI summary (Chrome built-in),
  spaced-review CSV export, IndexedDB transcript search index.
- **v3.31** Accessibility, mobile, low power — strong reduced motion,
  forced-colors support, global aria-live region, Low Power profile.
- **v3.32** Premium visual system — OLED token rewrites, dense mode,
  rectangularize-YouTube, classic layout profiles, new-player UI
  restore, token theme bridge.
- **v3.33** Integrations & interop — alternative-frontend handoff,
  VLC/MPV protocol handoff (GitHub-only), Astra context menu,
  YouTube Music compatibility.

### Definition Of Done — v4.0.0 status

- [x] Ships as MV3 Chrome, MV3 Firefox, and readable single-file
      userscript artifacts.
- [x] Beats every competitor in the matrix by unioning their core
      user-facing features or documenting a policy/technical
      exclusion. (See ROADMAP.md "Master Feature Matrix" rows: every
      one is either shipped, store-profile-gated, or explicitly
      documented as deferred / policy-blocked.)
- [x] Settings panel includes every feature as a grouped, persistent,
      instant-apply toggle/control.
- [x] No light theme is present.
- [x] No new keyboard shortcuts are added. (`Ctrl+Shift+Y` /
      `Ctrl+Alt+Y` are pre-v3.25 surfaces; all new features use
      visible buttons, menus, or chips.)
- [x] No confirmation dialogs are used.
- [x] Every feature has a working `destroy()`. (Asserted by the 235
      hardening + regression tests added across v3.25 → v3.33.)
- [x] Injected CSS is scoped and removable. (Every new
      `injectStyle(...)` carries a feature ID and is cleared by the
      feature's `destroy()`; `reducedMotion` + `forcedColorsSupport`
      assert this scoping via `[class*="ytkit-"]`.)
- [x] Trusted Types and DOM injection paths are audited. (Every new
      feature uses `document.createElement` + `textContent` /
      `appendChild` — no innerHTML on user-supplied or YouTube-derived
      strings.)
- [x] MutationObservers process added nodes only. (commentFilterManager,
      subscriptionGroups, and existing observers all loop
      `m.addedNodes`; covered by hardening tests.)
- [x] Selector health is tested against refreshed MHTML fixtures.
      (Shipped in v3.24; selector health panel exposes
      `ytkit.exportSelectorHealth()`.)
- [x] API usage is rate-limited and cache-backed. (RYD enforces 100
      req/min + 500-entry LRU; SponsorBlock/DeArrow already used
      cookieless EXT_FETCH with cache.)
- [x] Privacy panel accurately shows every network touchpoint. (Safe-
      store vs full-GitHub profile model shipped in v3.23.)
- [x] Store-safe and full GitHub profiles are documented. (Cobalt
      fallback + VLC/MPV handoff gated on `github-full`; safe-store
      mode strips secrets and risky-handler settings on export.)
- [x] README.md is produced as a build deliverable. (Version badge
      bumped to 4.0.0; intro rewritten to reflect the 200+ feature
      surface.)
- [ ] Fresh Chrome and Firefox clean-profile smoke tests pass.
      (Manual QA gate — `npm run check` + `npm test` automated path
      is green; clean-profile smoke is the next operator action.)
- [ ] Userscript install/update path is verified. (Manual QA gate —
      automated metadata sync passes; install-from-raw path is the
      next operator action.)

### What's deferred

- **DeArrow channel override UI** (data model shipped in v3.28; the
  settings-panel surface ships in a follow-up).
- **Per-context quality matrix** (v3.26 line item — needs MAIN-world
  fullscreenchange + per-context listener wiring).
- **Popularity sort for subscriptions** (v3.29 line item — needs
  view-count-per-day extraction; date-desc covers the common case
  via YouTube's native default).
- **Optional AI tags for subscription groups** (v3.29 line item —
  hooked via the data model; surface depends on the local-AI backbone
  added in v3.30 evolving further).
- **Markdown/JSON/SRT/VTT export consolidation** (v3.30 line item —
  already covered by the existing transcript export buttons; the
  consolidation pass is cosmetic).

235/235 JS tests pass. Version drift check clean (all four sources at
4.0.0).


---

## Older entries (v3.33.0 and earlier)

For changelog entries from **v3.33.0** down through the original
v0.1.0 initial release, see [CHANGELOG-v3-archive.md](CHANGELOG-v3-archive.md).
The archive carries the full v3.x hardening-pass history, the v3.21.0
i18n foundation, the iter-N research-loop pre-cursor work, and the
original YouTube-Kit-era entries before the Astra Deck rebrand.
