# Roadmap - Astra Deck

## Research-Driven Additions

## Deep Audit Backlog (2026-07-08)

Findings from the 2026-07-08 deep audit that were NOT fixed in that pass —
either unverifiable without a live browser, behavior changes needing in-browser
confirmation, or product decisions. Fixed items shipped in v4.46.28 (see
CHANGELOG). Priorities: P0 highest.

### Correctness / regressions (verify in a browser before/after)

- [ ] P2 — Userscript bundle is stale and the next sync will break Import
  Why: `YTKit.user.js` still bundles the pre-4.46.26 settings-panel and
  pre-4.46.27 subscription-groups modules, so the shipped userscript lacks the
  Takeout import, import summaries/undo, and group import counters it claims by
  version. Worse, the module sources now call `settingsManager.importAllSettingsDetailed`
  and `importYouTubeTakeoutWatchHistory`, which the userscript monolith's
  `settingsManager` does not implement — so `node sync-userscript.js` will ship
  an Import button that throws `TypeError` on click. Port both methods into the
  monolith `settingsManager` (and the `deno-runtime-unsupported` recovery copy)
  before regenerating the bundle.
  Where: YTKit.user.js, extension/features/settings-panel/index.js, sync-userscript.js

- [ ] P2 — video-hider mutation batching can drop unprocessed feed cards
  Why: each MutationObserver flush cancels the prior budgeted batch before it
  runs and only enqueues the new cards; during infinite-scroll bursts earlier
  batches are cancelled before processing, so cards that should be hidden stay
  visible until the next full pass. Consider requeueing unprocessed items on
  cancel instead of dropping them.
  Where: extension/features/video-hider/index.js (~1487-1500), YTKit.user.js

- [ ] P2 — theaterAutoScroll / autoTheaterMode now fire on every play/pause
  Why: since the player-task-manager migration these tasks subscribe to
  `player-state`, which `notify()` re-runs on every play/pause/buffer state
  change — scrolling the viewport back to the player and re-forcing theater
  after the user manually exits it mid-video. Restrict these to navigate/route
  changes only.
  Where: extension/ytkit.js (~27837-27867 theaterAutoScroll, ~23817 autoTheaterMode)

- [ ] P2 — Takeout import double-counts on dedupe-ledger overflow
  Why: `mergeTakeoutWatchHistoryIntoStats` adds every accepted entry's seconds
  to days/total, but the ledger is capped at 5000 entries; entries beyond the
  cap lose their dedupe row while keeping their seconds, so re-importing the same
  file re-imports them and inflates totals. Track total/days as a function of the
  (capped) ledger, or cap before accumulating.
  Where: extension/ytkit.js (sanitizeWatchTimeImportedEntries / merge)

- [ ] P3 — Takeout import rejects real multi-year Takeout files (10 MB cap) and
  has no undo
  Why: real `watch-history.json` is commonly 50-200 MB; the hard 10 MB reject
  gives a generic error. The Takeout merge also has no undo snapshot (unlike the
  settings import). Raise/stream the cap with guidance and add an undo toast.
  Where: extension/ytkit.js (handleFileImport, importYouTubeTakeoutWatchHistory)

- [ ] P3 — watch-time tick sanitizes + serializes the full imported ledger twice
  per 10s tick after a large import
  Why: `_tick` runs `_getStats`/`_writeStats`, each re-sorting/rebuilding up to
  5000 imported entries every 10s during playback. Cache the sanitized ledger.
  Where: extension/ytkit.js (~22516-22543)

- [ ] P3 — OPML import silently drops subtrees on nodes with both a channel id
  and children
  Why: `_groupsFromOpmlTree` returns a node as a channel before visiting its
  children when it has a resolvable channelId AND children, losing whole folders
  with no skipped/duplicate accounting.
  Where: extension/features/subscription-groups/index.js (~1826-1834)

- [ ] P3 — player task-manager retry ladder has an off-by-one (double immediate
  retry)
  Why: `nextDelay` reads `delays[attempt]` before `retry` increments, so the
  first retry reuses `delays[0]` (0 ms) — an extra immediate re-run instead of
  backing off at 150 ms. Low impact; MAIN-world quality forcing is tuned around
  current timing, so verify features after changing.
  Where: extension/core/player.js (~73-87)

### Reliability / resource

- [ ] P2 — navigation.js `pendingMutationRecords` grows unbounded in hidden tabs
  Why: records accumulate whenever `requestAnimationFrame` is paused (background
  tab) while the observer keeps delivering, pinning detached subtrees for the
  whole hidden period and draining in one giant pass on refocus. Add a cap or a
  hidden-tab fallback drain.
  Where: extension/core/navigation.js (~303-327)

- [ ] P2 — predicate-sandbox ReDoS guard misses group-free polynomial patterns;
  budget checked only after evaluation
  Why: `hasUnsafeQuantifiers` requires adjacent quantifiers or a quantified
  group, so `.*.*.*…` / `a{0,99}a{0,99}…` (no groups) passes and can backtrack
  for minutes on the content-script main thread; the 5 ms budget is checked after
  `evaluate()` returns, too late to interrupt. User filter predicates travel
  through settings import, so shared lists are a vector. Add a pre-compile
  complexity screen and/or a real time-boxed evaluator.
  Where: extension/core/predicate-sandbox.js (~44-94, 355-366)

### Security (product decisions)

- [ ] P1 — Companion `/health` echoes the auth token to any co-installed
  extension by default
  Why: `LegacyHealthTokenEcho` defaults on and `is_extension_origin` accepts any
  `chrome-extension://` / `moz-extension://` origin (no ID allowlist), and CORS
  reflects that origin — so any other installed extension can spoof the
  `X-MDL-Client: MediaDL` header, read the reflected `token`, and drive
  `/download`. Default the echo off once the native-messaging bootstrap is the
  confirmed primary path for existing users, or gate on a configured extension-ID
  allowlist. (Impact bounded: YouTube-only URL gate, output-dir confinement.)
  Where: astra_downloader/astra_downloader.py (~3661-3810)

- [ ] P3 — Unauthenticated `/health` leaks recent log lines (local paths / errors)
  Why: `recentErrors` (last 20 log messages, absolute paths and error text) is
  in the fully-unauthenticated `/health` payload. Gate behind auth or redact.
  Where: astra_downloader/astra_downloader.py (~3791)

### UX / product quality (needs a live browser to verify)

- [ ] P2 — Popup capability probe is blocked by the popup meta CSP
  Why: `connect-src 'self'` blocks the popup's `127.0.0.1` health/version fetches,
  so MediaDL/Ollama-gated rows always render the misleading "unavailable" chip
  even when the companion is running. Probe via the background service worker (or
  relax connect-src to the loopback origins) instead of fetching from the popup.
  Where: extension/popup.html (meta CSP), core/capability-probe.js, popup.js

- [ ] P2 — Popup storage-banner Reset bypasses the PIN gate and the double-run
  guard
  Why: the banner Reset calls `resetAllData()` directly (the primary Reset is
  PIN-gated), and only disables the primary button — a rapid double-click on the
  banner overwrites the good undo snapshot with sentinels. Route it through the
  PIN gate and disable both buttons during reset.
  Where: extension/popup.js (~4369 vs 4397)

- [ ] P2 — Popup Export silently truncates backups to the import caps
  Why: `buildExportData` routes live storage through the import sanitizers
  (5000/5000/2000/400×100 caps), so users over any cap get a backup missing data
  with no warning — and the reset flow recommends exporting first. Export the
  full data or warn with counts.
  Where: extension/popup.js (~3617-3643, 3515-3585)

- [ ] P2 — Side-panel toggles bypass optional-host permission + profile gating
  Why: side-panel `writeSetting` does not call `requestOptionalHostsForSetting`,
  so enabling an API-backed feature (SponsorBlock/DeArrow) reports success while
  the feature silently no-ops without host access; store-safe github-full-only
  entries are also flippable with only a passive chip. Mirror the popup gating.
  Where: extension/sidepanel.js (~437-453)

- [ ] P2 — Side-panel loses keyboard focus after every toggle
  Why: each successful toggle rebuilds all rows and the focused row becomes a
  detached node, dropping focus to `<body>`; a keyboard user must Tab from the
  top after every toggle. Restore focus after re-render like the popup does.
  Where: extension/sidepanel.js (~598, 630-638)

- [ ] P1 — MAIN-world audio graph reconnect throws on the reused `<video>`
  Why: the audio-feature bridge closes and recreates the AudioContext and calls
  `createMediaElementSource` again on the same persistent YouTube `<video>`,
  which Chrome permanently binds to its first source node — the second call
  throws and can leave audio routed into a closed context (muted). Create the
  source once per element (WeakMap) and use a passthrough gain when idle rather
  than closing the context. Verify in-browser which audio features reach this.
  Where: extension/ytkit-main.js (~395-429, 502-512)

### Tooling / maintainability

- [ ] P3 — `npm run lint` does not cover `extension/features/**`,
  `core/selector-packs/*`, `sidepanel.js`, or `ytkit-main.js`
  Why: the `require-catch-reason` invariant is unenforced across the fastest-
  growing part of the tree. Expand the eslint glob (and fix any surfaced
  silent-catch violations).
  Where: package.json (lint script), eslint.config.js

- [ ] P3 — `generate-locales.js` pins stale translations after English edits
  Why: `hasExistingTranslation = existingMsg !== enMsg` preserves any locale
  string that differs from the *current* English, so a reworded EN message keeps
  the old translation forever and mapped translations can never apply.
  Where: scripts/generate-locales.js (~1440); PROOFED override English-as-
  translation entries (~1208-1418)

- [ ] P3 — New import/undo/Takeout UI strings are hardcoded English
  Why: "Import History", summary/undo strings, and Takeout messages bypass the
  locale catalog; the i18n gate cannot see DOM literals so coverage stays green.
  Route through `t()`.
  Where: extension/features/settings-panel/index.js (~2034-2037), extension/ytkit.js
