# Changelog

All notable changes to Astra Deck are documented here. Versions are listed newest-first.

---

## [Unreleased]

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
  stable-selector-first, `// reason:` invariant, no
  Co-Authored-By, schema parity, version-drift gate), worked
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

### Cumulative scoreboard (single autonomous v5.1.0 session)

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

### Cumulative scoreboard (single autonomous session)

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

## [4.5.1] - 2026-05-20 — N11 M-phase #6 + N21/N22 architectural regression pins

Test-and-extraction patch on top of v4.5.0. No user-visible behavior
change. Three additions:

### Modularization (iter-8 extended N11 M-phase #6)

- **ICONS + createSVG extracted to `extension/core/icons.js`**
  (iter-8 N23-extended). The 404-line inline block (createSVG SVG
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
  N11 M-phase since iter-7 start: **44,264 → 43,081 = -1,183 LOC
  (-2.67%)**. Six core modules extracted to date.

### Architectural regression pins

- **SponsorBlock event-driven scheduling pinned** (iter-8 N21). Upstream
  SponsorBlock v6.1.5 (2026-04-21) fixed "segments not skipping when
  video is scrolled away" — their old path was gated on a `requestAnimationFrame`
  loop that stops firing when YouTube hides the off-screen video via
  IntersectionObserver. Our SB has always used event-driven setTimeout
  boundaries (scheduled from playing / seeked / ratechange), viewport-
  agnostic. 3 new regression tests fail loudly if a future refactor
  re-introduces rAF-gating on `_checkSkip` / `_scheduleNextSkip`, OR
  drops the paused-video early-return, OR consults IntersectionObserver /
  getBoundingClientRect / offsetParent.
- **DeArrow selector chain resilience pinned** (iter-8 N22). Upstream
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

## [4.5.0] - 2026-05-20 — N11 M-phase #4-#5 + yt-dlp 2026 external runtime surface

Rolling-release cut bundling iter-5 / iter-6 / iter-7 / iter-8 hardening
plus three iter-8 deliveries: TranscriptService + StorageManager
extractions out of the 44k-line ytkit.js monolith (M-phase #4 and #5),
and the AstraDownloader v1.5.0 Deno-runtime presence probe that surfaces
yt-dlp's 2026 external-JS-runtime dependency on the wire so field
installs see a "Deno: missing" pill instead of silent YouTube
download failures.

### Modularization (iter-8 — N11 M-phase continues)

- **TranscriptService extracted to `extension/core/transcript-service.js`**
  (iter-8 N18, M-phase #4). The 446-line inline `const TranscriptService = {…}`
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
  `extension/core/storage-manager.js`** (iter-8 N19, M-phase #5). The
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
  fallback wrappers). Cumulative N11 M-phase reduction since iter-7
  start: 44,264 → 43,407 = -857 lines (-1.93%). Five extractions
  shipped to date: DiagnosticLog, PredicateSandbox, VideoTypeDetector
  (iter-7), TranscriptService, StorageManager (iter-8).

### Downloads / observability (iter-8 N20)

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

### UI surfaces shipped earlier in iter-6 (now part of this release window)

- **Storage-quota proactive warning banner** in the toolbar popup
  (iter-6 N2). Renders when usage > 80% of the 10 MB
  `chrome.storage.local` ceiling. Uses the same accent-tinted warn
  styling as the existing diagnostic banners.
- **Storage corruption detector + recovery banner** (iter-6 N4). If
  `chrome.storage.local.get(null)` returns a malformed payload, the
  popup surfaces an amber banner with a clear-storage CTA. No silent
  data loss.
- **Per-context DiagnosticLog counters via `countsByCtx()`**
  (iter-6 N6). The ring buffer maintains O(1) bookkeeping per
  context tag (`trusted-types` / `selector-health` /
  `storage-corruption` / `settings-migration` / `console` / `window`),
  with ring-trim decrement and lazy resync from the persisted ring on
  first read. Wrong-order bug from the in-line implementation (push
  → resync → increment) fixed during extraction.
- **Popup selector-health dashboard** (iter-6 N7). Surfaces the
  iter-5 N5 DOM-shape drift detection in the popup — pills per
  surface showing live drift status. `schemaVersion 2` for the
  export.
- **`extension/popup.html` inline CSP meta tag** (iter-6 N3).
  Defense-in-depth: complements the existing manifest CSP with a
  page-level `<meta http-equiv="Content-Security-Policy">` so the
  popup is constrained even if the manifest CSP is somehow stripped.
- **MainWorld MutationObserver consolidation** (iter-6 N9). Three
  separate `MutationObserver` instances on `<html>` in
  `ytkit-main.js` consolidated into one. Reduces per-frame DOM
  observation cost.
- **TrustedHTML fallback delegation to `core/trusted-html.js`**
  (iter-6 N10). The inline DOMParser fallback in `ytkit.js`
  `TrustedHTML` now delegates to the shared `core.setTrustedHTML` /
  `core.toTrustedHTML` helpers when the core module is present,
  keeping ytkit.js's inline fallback only for the unit-test path.
- **bgutil-ytdlp-pot-provider stale-version notice in `/health`**
  (iter-6 N14). The `poTokenProvider` field gains a `stale: bool`
  + `minVersion: str` pair. Set true when the detected provider
  version compares less than `BGUTIL_POT_MIN_VERSION = "1.3.0"`.
  Extension popup health surface renders an amber "update bgutil-pot"
  pill distinct from the absence notice.

### Modularization shipped earlier in iter-7 (now part of this release window)

- **DiagnosticLog extracted to `extension/core/diagnostic-log.js`**
  (iter-7, M-phase #1). Ring buffer + per-ctx counters now live in a
  ~170-line core module. Coupling to `appState.settings` /
  `settingsManager.save` flows through accessor callbacks.
- **PredicateSandbox extracted to `extension/core/predicate-sandbox.js`**
  (iter-7, M-phase #2). The custom-JS predicate evaluator and its
  PredicateError class moved into a 343-line core module. The
  sandbox uses `new Function('ctx', userCode)` against a frozen
  context — no eval, no Function constructor with arbitrary deps.
- **VideoTypeDetector extracted to `extension/core/video-type.js`**
  (iter-7, M-phase #3). The "is this video a Short / livestream /
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

- 258 → 299 JS tests across the iter-5 + iter-6 + iter-7 + iter-8
  arc (+41 regression assertions): api-limiter clear() reject
  behavior, pill-backdrop guard in ytkit.js + theater-split,
  direct-innerHTML-SVG detector, locale parity gate, Retry-After
  honoring, YTKIT_SETTINGS_REPLACED handler presence, DOM-shape
  drift detection + cooldown + re-entry guard + ext-internal
  channel, storage-quota banner threshold, storage-corruption
  detector trigger, per-ctx counter resync, MutationObserver
  consolidation invariants, TrustedHTML core delegation, popup
  selector-health export schema version, and the M-phase
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

## [3.33.0] - Integrations & Interop

Closes the v3.33 roadmap with four new features. Karamel-style Reddit
comments + protocol streams were already shipped in earlier releases.

### Added (extension)

- **`openInAlternativeFrontend`.** Adds an "Open externally" anchor
  next to the player. Resolves the current video to
  `${alternativeFrontendInstance}/watch?v=<id>` with default
  `https://yewtu.be`. Anchor uses `target="_blank"` plus `rel="noopener
  noreferrer"`. Default off; user-configurable instance setting.
- **`vlcMpvHandoff`.** GitHub-full profile gated. Adds VLC and MPV
  buttons next to the player that fire `ytvlc://` / `ytmpv://`
  protocol URLs through a transient `<a>` element (never
  `window.location`, so pages without a registered handler stay put).
  Toast notifies the user when the handoff fires.
- **`astraContextMenu`.** Right-click the player or a feed card to get
  Astra actions: Copy video URL, Copy timestamp link, Open transcript,
  Hide channel, Copy card URL. Native YouTube right-click stays
  intact when the click lands outside Astra targets — the handler
  early-returns before calling `preventDefault`.
- **`youtubeMusicCompat`.** Applies the OLED + rectangularize hooks
  on `music.youtube.com`. Targets `ytmusic-app`, `ytmusic-app-layout`,
  and `ytmusic-pill-shape-renderer`. Player-specific features keep
  their existing per-page gating.

### Tests

- 4 new regression tests covering noopener+noreferrer on the external
  open path, github-full gating + anchor.click() protocol handshake
  for VLC/MPV (never window.location), contextmenu early-return guard
  + preventDefault path + destroy() removing the listener, and
  music.youtube.com hostname gate. 235/235 JS tests pass.

## [3.32.0] - Premium Visual System

Closes the v3.32 roadmap with six new features. The OLED + token-bridge
combo means dark surfaces survive YouTube native theme reshuffles
because we hook the tokens themselves, not surface classes.

### Added (extension)

- **`oledTheme`** — rewrites `--yt-sys-color-baseline--base-background`,
  `--raised-background`, `--overlay-background-heavy` plus the legacy
  `--yt-saturated-*` set to true black `#000`. Survives YouTube's
  native theme switches because the token bridge runs even after the
  surface classes change.
- **`denseMode`** — global density scale on Astra-injected surfaces
  (toolbars / chips / pills / panels). Does not change YouTube's
  native layout — only our own controls.
- **`rectangularizeYouTube`** — strips YouTube's pill / stadium /
  fully-rounded backdrops. Clamps `yt-button-shape`, `yt-chip-cloud-
  chip-renderer`, `yt-spec-button-shape-next`, `ytd-button-renderer`,
  `ytd-toggle-button-renderer`, `yt-icon-badge-shape`, `yt-tab-shape`,
  `ytd-pivot-bar-item-renderer` to 8 px. Avatars / progress rings
  stay circular via an explicit 50% carve-out.
- **`classicLayoutProfile`** — three-mode select: `modern` (default),
  `classic-2020` (56 px masthead + 8 px rich-grid margin + 380 px
  sidebar), `classic-2016` (50 px masthead + 6 px rich-grid margin +
  426 px sidebar + 854 px watch-page max width).
- **`newPlayerUiRestore`** — Control Panel-style restoration. Hides
  `.ytp-delhi-modern`, `.ytp-overflow-panel-button`, `.ytp-delhi-modern-
  fullscreen-action`. Tightens the progress bar to 3 px and removes
  the rounded progress-fill radius.
- **`tokenThemeBridge`** — pipes the user's `themeAccentColor` into
  `--yt-sys-color-baseline--call-to-action`, `--static-brand-red`,
  `--yt-spec-call-to-action`, `--yt-spec-static-brand-red`,
  `--yt-spec-brand-button-background`. Native badges and primary
  buttons follow the Astra accent without per-surface restyling.

### Tests

- 5 new regression tests covering OLED token rewrites (both `--yt-sys-*`
  and legacy `--yt-saturated-*`), rectangularize backdrop clamping +
  circular carve-out + no 999 px / 100% radii (matches the user's
  "no pill backdrops" hard rule), classic-layout three-mode surface,
  and token-theme-bridge accent → `--yt-sys-color-*` propagation.
  231/231 JS tests pass.

## [3.31.0] - Accessibility, Mobile, and Low Power

Closes four of six v3.31 line items in this release; CPU/chat tamer
improvements were already shipped under `enableCPU_Tamer` (v3.10), and
the Firefox-Android smoke path is a manual QA item that doesn't
require code changes — both items stay marked done.

### Added (extension)

- **Reduced Motion (`reducedMotion`).** Stronger than the browser
  default — every Astra-injected `[class*="ytkit-"]` element gets
  `animation-duration: 0.001ms` / `transition-duration: 0.001ms` /
  `scroll-behavior: auto`. Shimmer / pulse / ripple animations are
  explicitly set to `animation: none`.
- **Forced Colors / High Contrast Support (`forcedColorsSupport`).**
  Hooks `@media (forced-colors: active)` and maps every injected
  control to system colors (`Canvas`, `CanvasText`, `LinkText`,
  `Highlight` for focus outlines). Sets `forced-color-adjust: none`
  so the system colors actually win.
- **Live Region For Toasts (`globalAriaLiveRegion`).** Mounts a single
  hidden `role=status / aria-live=polite / aria-atomic=true`
  container under `<body>`. Exposes `window.__ytkitAnnounce(message)`
  — clears + sets on `requestAnimationFrame` so screen readers fire a
  change notification even when the same text repeats.
- **Low Power Profile (`lowPowerProfile`).** Recipe toggle. Disables
  cinemaAmbientGlow / videoVisualFilters / playbackStatsOverlay /
  monetizationIndicator / researchTranscriptIndex / transcriptViewer /
  blueLightFilter / speedIndicatorOverlay, and explicitly enables
  `enableCPU_Tamer`. Backup snapshot at `ytkit-low-power-backup`
  restores exact prior values on toggle-off.

### Tests

- 4 new regression tests covering reduced-motion class scoping +
  duration zeroing, forced-colors media query + system color mapping
  + focus outline, aria-live region role + aria-live + announce
  helper exposure, and Low Power backup-and-restore. 226/226 JS tests
  pass.

## [3.30.0] - Research Workspace

Closes the v3.30.0 roadmap minus the "Markdown/JSON/SRT/VTT export
consolidation" line, which was already shipped under transcript export
buttons in prior releases. Existing `timestampBookmarks` already
covers timestamp notes + highlights; this release adds the
three missing surfaces.

### Added (extension)

- **Local AI Summary (`localAiSummary`).** Uses Chrome's built-in
  Summarizer API (`window.Summarizer` or `window.ai.summarizer`) when
  available. Adds a "Local Summary" button next to the existing AI
  Summary surface. Never falls through to a remote provider — when
  the API isn't exposed, surfaces an explicit modal explaining the
  origin trial path instead. Transcript pulled via the existing
  `aiVideoSummary._fetchTranscriptText` helper with an engagement-
  panel fallback.
- **Spaced Review Export (`researchSpacedReview`).** Exports your
  timestamp bookmarks as a SuperMemo / Anki-friendly CSV
  (front | back | tags). Front is the bookmark note (or timestamp);
  back is a `[mm:ss](https://youtu.be/<id>?t=<s>)` deep link; tags
  include `astra-deck` and the video ID. CSV escaper double-quotes
  embedded quotes per RFC 4180.
- **Transcript Search Index (`researchTranscriptIndex`).** Indexes
  every visited video's transcript into IndexedDB (`ytkit-transcript-
  index`, store `transcripts`, keyed by `videoId`). Exposes
  `window.__ytkitSearchTranscripts(query)` (returns up to 200 hits)
  and `window.__ytkitClearTranscriptIndex()` for the settings panel.
  No network calls; transcripts read from the engagement panel only.

### Tests

- 3 new regression tests covering local-AI no-network guarantee (no
  fetch/XHR in the `_summarize()` path), CSV escaping per RFC 4180,
  and IndexedDB schema (DB name, store keyPath, hit cap). 222/222 JS
  tests pass.

## [3.29.0] - Subscription Manager

Closes the entire roadmap v3.29.0 — local groups, sort modes, group
export/import, and new-since-last-visit markers all ship in one
feature: `subscriptionGroups`. The guide-sidebar section ships as a
toolbar above the subscriptions feed rather than a guide-level
injection; the data model can drive a guide section in a follow-up
without changing storage shape.

### Added (extension)

- **`subscriptionGroups`.** Adds a toolbar above `/feed/subscriptions`
  with: an "All" chip + one chip per saved group (with channel count),
  a "+ Group" button to create a new group, a sort `<select>` (default
  / shortest first / unwatched first / new since last visit), and
  Export / Import buttons.
- **Local group storage (`subscriptionGroupData`).** Shape:
  `{ groupId: { name, color, channelIds[], updatedAt } }`. Channel IDs
  store the canonical `UC…` form, falling back to `@handle` when that
  is what the card link exposes. Cap of 1000 channels per group on
  import; group names trimmed to 80 chars; colors validated against
  `^#[0-9a-fA-F]{6}$`.
- **`subscriptionShowNewSinceLastVisit`.** Marks cards whose channel
  ID hasn't appeared in `subscriptionLastVisitData` with a green NEW
  badge. `subscriptionLastVisitData` is stamped 8 s after every
  subscriptions-feed visit so subsequent visits accurately reflect
  what is actually new since the last visit.
- **`subscriptionSortMode` select.** Modes: `default` (YouTube's
  native order), `duration-asc` (shortest first — parses the timestamp
  badge), `unwatched` (cards with a `ytd-thumbnail-overlay-resume-
  playback-renderer` resume bar sink to the bottom), and
  `new-since-last-visit` (unknown channels bubble up).
- **Group export/import.** Export writes a JSON payload with
  `schemaVersion: 1`, `exportedAt`, and `groups`; filename includes
  the project prefix and date. Import sanitizes every entry
  (name length, color hex, channelIds array shape) before writing.

### Tests

- 4 new regression tests covering channel-ID extraction + SPA
  hooking, JSON export schema + import sanitation, destroy cleanup
  (toolbar removed, hidden-by-group classes removed, NEW badges
  removed), and the sort-mode option surface. 219/219 JS tests pass.

## [3.28.0] - Ratings, Clickbait, and Metadata Trust

Closes four of five v3.28.0 roadmap items. DeArrow channel override UI
is deferred to a later release because the existing DeArrow per-channel
data model already supports overrides through `deArrowChannelOverrides`
— the UI surface is the open work, not the runtime.

### Added (extension)

- **Return YouTube Dislike (`returnDislike`).** Cookieless fetch
  (`credentials: 'omit'`) to the public RYD votes API
  (`https://returnyoutubedislikeapi.com/votes?videoId=`). 100 req/min
  rolling budget; cache TTL = `returnDislikeCacheHours` (default 24 h,
  1 h floor); cache LRU-capped at 500 entries; pill renders inside the
  dislike-button-view-model with cached/fresh/offline tones. Default
  off.
- **Like/View Ratio (`returnDislikeShowRatio`).** When RYD data is
  available, surfaces a "% liked" secondary chip next to the dislike
  pill on watch pages. Reads RYD's `likes`/`dislikes` so the ratio is
  honest, not a like/view proxy. Default on (only renders when the
  parent `returnDislike` feature is on).
- **Anti-Translate Audio Track (`antiTranslateAudioTrack`).** Switches
  the player to the original audio track via
  `movie_player.getAvailableAudioTracks()` + `setAudioTrack()` when an
  "Original" track is exposed by YouTube's API. Capped at 5 retries
  one second apart so we don't loop forever when the API hasn't
  hydrated.
- **Anti-Translate Transcript (`antiTranslateTranscript`).** Strips
  `tlang` attributes from the transcript engagement panel before
  YouTube applies them, forcing the original-language transcript when
  available. Pairs with the existing `antiTranslate` title/feed work.
- **Monetization Indicator (`monetizationIndicator`).** Pill under the
  watch-page title showing one of: "Paid promotion declared" (paid
  content overlay or ytd-paid-content-overlay-renderer present),
  "Sponsorship overlay present" (ytd-merch-shelf-renderer /
  ytd-sponsorship-shelf-renderer / ytd-ad-slot-renderer), or N
  "SponsorBlock segment(s)" (when SponsorBlock has flagged
  sponsor/selfpromo), else "No paid overlays detected".

### Changed (extension / manifest)

- **`returnyoutubedislikeapi.com` added to `host_permissions`** and
  the CSP `connect-src` allowlist so the RYD votes endpoint is
  reachable from both the content script and extension pages.
  Background `ALLOWED_FETCH_ORIGINS` extended to match.
- **`deArrowChannelOverrides`** setting key seeded (`{}`) so future
  releases can ship the per-channel override UI on top of the existing
  DeArrow runtime.

### Tests

- 5 new regression tests covering RYD budget + cookieless fetch + LRU
  cap, RYD cache TTL minimum, manifest + CSP allowlist for the RYD
  origin, anti-translate audio track retry cap + setAudioTrack call,
  and monetization-indicator destroy cleanup. 215/215 JS tests pass.

### Deferred

- **DeArrow channel override UI.** The data model is wired
  (`deArrowChannelOverrides`); the settings-panel surface is the open
  task and will land in a follow-up.

## [3.27.0] - Downloads & Local Media Library

Adds the four extension-side standalone items from roadmap v3.27.0.
PO Token / SABR health surfacing rides on Astra Downloader's existing
`/health.poTokenProvider` / `/health.ffmpegCapabilities` fields (shipped
in downloader v1.4.0); no downloader changes required for this release.

### Added (extension)

- **Downloader Health Pills (`downloadHealthPanel`).** When on, renders
  a chip strip next to the player's download button with yt-dlp
  version, ffmpeg freshness (with amber pill when current=false), and
  PO Token provider state (green=live, amber=not running, red=
  unreachable). Polls `MediaDLManager.baseUrl() + '/health'` every 30 s
  with the existing `X-MDL-Client: MediaDL` + bearer token. Destroy
  removes the chip strip, clears the poll timer, and removes the style
  tag.
- **Stream Links Panel (`downloadStreamLinksPanel`).** Advanced /
  power-user surface. Parses `ytInitialPlayerResponse` from inline
  script tags, lists combined (legacy) + adaptive formats with mime
  type and quality label, and offers a per-row "Copy URL" button.
  SABR-only formats render as a disabled "SABR-only" pill so the user
  knows why no URL is offered. Empty state explains the
  `youtube:formats=duplicate` path Astra Downloader uses to bypass
  SABR.
- **Cobalt Fallback (`downloadCobaltFallback`).** GitHub-full profile
  only — `getProfileExportMode(...) === 'github-full'` is checked on
  every invocation. Default off. When triggered (button next to the
  download button) and Astra Downloader is unreachable, POSTs the
  current URL to the configured cobalt instance
  (`downloadCobaltInstance`, default `https://api.cobalt.tools/api/json`)
  and opens the returned media URL in a new tab with
  `noopener,noreferrer`. If Astra Downloader is reachable, the
  fallback is skipped with a toast.
- **Download History Panel (`downloadHistoryPanel`).** Adds a
  "History" button next to the player's download button. Renders the
  last 50 completed downloads from the local `/history?limit=50`
  endpoint. Shows an explicit "Astra Downloader unreachable" state
  when the local downloader isn't up; doesn't fall through to a blank
  panel.

### Changed (extension)

- **`MediaDLManager` plus the new download surfaces share the same
  bearer + X-MDL-Client header pattern** so future endpoints can be
  added without re-deriving the auth contract.

### Tests

- 4 new regression tests covering health-pill polling cadence + field
  surface, stream-links adaptive/combined extraction + SABR-only
  rendering, Cobalt fallback profile gate + downloader-offline check +
  noopener target, and history panel auth + bounded limit. 210/210 JS
  tests pass.

## [3.26.0] - Player Control Superset

Closes six of the seven items in roadmap v3.26.0 (the Tweaks-grade
per-context quality matrix remains for a follow-up release because it
needs the MAIN-world bridge to listen on more player lifecycle events).

### Added (extension)

- **Screenshot format picker (`downloadScreenshotFormat`).** PNG /
  JPEG (90% quality) / WebP (90% quality). PNG is lossless and the only
  format that copies to the clipboard via the ClipboardItem API; JPEG
  and WebP download but skip the clipboard step gracefully.
- **Subtitle-included screenshots (`downloadSubtitlesWithScreenshot`).**
  When on, the rendered caption line is baked into the bottom band of
  the canvas before encoding. Reads `.ytp-caption-segment` text; falls
  through silently when the player has no caption frame on screen.
- **Volume Wheel (`volumeWheelMode`).** Scrolling the mouse wheel over
  the player adjusts volume in 5% steps. A floating HUD chip surfaces
  the new level for 1.2 s. A persistent "Scroll to change volume" hint
  appears on hover so the gesture is discoverable. No keyboard shortcut
  added. Wheel listener uses `{ passive: false }` so we can preventDefault
  the page scroll while over the player.
- **Initial Player State (`initialPlayerStateForeground`,
  `initialPlayerStateBackground`).** Force play or pause on watch-page
  load, scoped by whether the tab is currently visible. Both selects
  default to `inherit` (YouTube's native behavior). Background-tab play
  is best-effort — most browsers gate autoplay-in-background behind a
  prior user gesture.
- **Disable Loudness Normalization (`disableLoudnessNormalization`).**
  Best-effort from the ISOLATED world: pins `video.volume` to identity
  whenever YouTube quietly clamps it under 1.0, and flips the html
  `data-ytkit-disable-loudness="1"` attribute so the MAIN-world bridge
  (future ytkit-main.js work) can disable the Web Audio gainNode there.
- **Per-Channel Intro/Outro Offsets (`perChannelIntroOutro`).** Skip
  the first N and last M seconds of every video on a given channel.
  Offsets persist under `perChannelIntroOutroData` keyed by channel ID.
  Skips bidirectionally: fast-forward past the intro window, and seek
  to end when the outro cutoff is reached.

### Changed (extension)

- **`SPEED_OPTIONS` expanded from 10 → 18 entries** (0.1, 0.25, 0.5,
  0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 16). Speed
  popup grid widened from 5 to 6 columns to fit. Persistent-speed
  storage and visible palette stay in sync — selecting any value writes
  `persistentSpeedValue` and re-applies through the existing
  `persistentSpeed._applied` reset path.
- **`videoScreenshot._capture` threads chosen mime/quality through
  `_blobFromCanvas` and `_copyBlobToClipboard`.** Clipboard write only
  fires on PNG (Chrome ClipboardItem API limitation) — JPEG/WebP
  capture downloads only. JPEG/WebP encoding quality fixed at 0.92.

### Tests

- 8 new regression tests covering screenshot format threading,
  subtitle-overlay rendering, expanded speed range, volume-wheel
  passive:false + preventDefault + visible hint, volume-wheel destroy
  cleanup, initial-player-state visibility gating + inherit mode,
  per-channel intro/outro storage + skip behavior, and loudness
  normalization data-attribute toggle. 206/206 JS tests pass.

### Deferred

- **Quality matrix per context (normal/theater/fullscreen/background/
  embed).** The Tweaks-grade per-context quality default needs MAIN-
  world `ytkit-main.js` to listen on fullscreenchange and
  yt-navigate-finish + interrogate the current player UI state on every
  transition. Scoped for v3.26.1 or v3.27.0 to keep this release
  focused on the standalone features.

## [3.25.0] - Content Filtering Superset

### Added (extension)

- **BlockTube-grade Comment Filter.** New `commentFilterManager` feature
  hides comment threads whose author or body text matches user rules.
  Supports comma- or newline-separated rules: bare keywords for body match,
  `@handle` for author match, `!word` for allowlist override, and
  `/pattern/flags` regex with the same ReDoS guard the video keyword
  filter uses (rejects nested quantifiers and alternation-wrapped
  quantifier stacks). Mutation observer processes `addedNodes` only — no
  full-document scans per tick. Destroy unhides every previously-blocked
  thread.
- **Advanced Local Predicate sandbox (expression-only, Option C).**
  `advancedLocalPredicate` finally has a runtime. Predicate body parses
  to an AST of literals, comparisons, logical operators, `ctx.<field>`
  access, and a fixed allowlist of methods (`includes`/`startsWith`/
  `endsWith`/`match`/`test`). No `eval`, no `new Function`, no `with`,
  no member access outside `ctx`, no loops. Per-card budget 5 ms wall
  clock; 10 consecutive errors auto-disable for the route. `ctx` is
  frozen at the call site. Pattern arguments to `match`/`test` must be
  string literals and are ReDoS-screened at parse time. Default off.
  See `docs/predicate-sandbox-investigation.md` for the threat model and
  the rejected Options A/B.
- **Bulk Card Actions (Multiselect parity).** `bulkCardActions` adds a
  floating "Bulk Select" toggle to feed surfaces (home, subscriptions,
  search, channel). With select-mode on, clicking any feed card adds it
  to the selection; a docked action bar surfaces Hide, Allow, Copy URLs,
  and Clear. Hide and Allow defer to `videoHider._addHiddenVideos` /
  `_addAllowedVideos` so storage stays single-source. Destroy removes
  the toggle, action bar, and capture-phase click listener.
- **Feed Triage Profile (curated recipe).** `feedTriageProfile` is a
  one-toggle recipe that flips a curated set of filter settings on
  together: Shorts removal/redirect, hide live/upcoming/mixes/movies/
  auto-dubbed, hide watched videos, hide AI Summary and Jump Ahead,
  disable infinite scroll, auto-dismiss still-watching, and hide the
  merch shelf. Toggling off restores the user's prior values from a
  backup snapshot persisted at `ytkit-feed-triage-backup`.

### Documentation

- **`docs/predicate-sandbox-investigation.md`** — captures the threat
  model, the three rejected sandbox options (`with`-shadowed Function,
  sandboxed iframe transport, static AST allowlist), the chosen
  expression grammar, the `ctx` surface contract, the performance
  budget, and the acceptance checklist for v3.25.0.

### Changed (extension)

- **`videoHider._shouldHide` runs the predicate evaluator** after the
  metadata-driven filters but before the per-card duration filter, so
  predicates can both add hides and (via a wrapping `!`) override
  existing ones without disturbing the channel/keyword/regex layer.

### Tests

- 13 new regression tests covering predicate-sandbox safety invariants
  (no eval/Function/with, ReDoS guard, parse-error position surface,
  runtime budget and circuit breaker, videoHider ctx freezing),
  comment filter compile-time ReDoS guard and addedNodes-only mutation
  loop, bulk-action storage delegation and destroy cleanup, Feed Triage
  backup/restore round-trip. 198/198 JS tests pass.

---

## [3.23.0/3.24.0] - Core foundation & Selector Health

### Added (extension)

- **v3.23 core foundation modules.** Added passive `core/registry.js`,
  `core/selectors.js`, `core/trusted-html.js`, and `core/api-limiter.js`
  modules ahead of `ytkit.js` in both standard YouTube and live-chat
  content-script contexts. The new contracts cover reversible feature
  cleanup, stable-first surface selectors with first-miss diagnostics,
  centralized TrustedTypes policy access, and bucketed API scheduling
  without changing current feature behavior.
- **Registry-backed settings schema.** The core feature registry can now
  generate a settings schema from registered feature metadata plus
  `settingsManager.defaults`, including default-only and internal keys.
  The debug API exposes it as `ytkit.settingsSchema()` for future
  settings-panel and import/export work.
- **Category cleanup and health snapshots.** The core registry now owns
  category cleanup buckets, category destroy orchestration, and category
  health rollups. `ytkit.categoryHealth()` reports feature counts,
  initialized counts, cleanup counts, and status totals by category.
- **Safe-store and full-GitHub profile model.** Settings now normalize
  profile-mode defaults on load, save, and import. Named local profile
  saves stay full-fidelity, while profile exports can explicitly emit a
  store-safe payload or a full GitHub payload with declared metadata.
  Safe-store exports exclude secrets, custom code, downloader/AI provider
  details, and other local-only fields through an allowlisted snapshot;
  `settingsProfiles.exportSafeStoreJson()`,
  `settingsProfiles.exportGithubFullJson()`, and
  `settingsProfiles.profileModel()` expose the contract for future UI.
- **Selector source map and health export.** The roadmap selector map now
  lives in `core/selectors.js` as stable-first chains with fallback,
  high-churn, and fresh-capture metadata. Resolver misses now record
  per-surface health, dispatch first-miss diagnostics into the diagnostic
  log, and expose `ytkit.selectorHealth()` plus
  `ytkit.exportSelectorHealth()` for runtime reports. Player chrome
  chains include legacy and new-UI transition candidates, including
  Delhi/overflow/action-container surfaces.
- **Runtime selector health panel.** The Advanced settings workspace now
  includes a Selector Health report with live surface totals, miss/error
  rows, refresh feedback, and one-click JSON export for debugging
  YouTube DOM drift.
- **Video Hider content-filtering foundation.** Channel blocks are now
  normalized into ID-first records with handle, vanity, URL, blockedAt,
  and legacy fallbacks so blocklist import/export survives YouTube URL
  shape drift. Video Hider also gained opt-in low-view, live, upcoming,
  mix, playlist, movie, auto-dubbed, and watched-ratio filters with an
  immediate-apply Content Type Filters settings section.

### Documentation

- **Selector fixture workflow.** Added
  `docs/selector-fixture-workflow.md` and linked it from
  `CONTRIBUTING.md`. The workflow covers fresh MHTML capture,
  `npm run build:fixtures`, selector-diff review, promotion into
  `core/selectors.js`, and pairing live `ytkit.exportSelectorHealth()`
  reports with fixture updates.
- **Doc + version drift sweep (N4).** README version badge bumped to
  v3.22.0; intro names speed control + reaction spammer + 10 locales;
  new "Languages" section with the bundled locale table; feature tables
  add Speed Control Chip + Reaction Spammer rows. Security line reflects
  the new CSP `connect-src` allowlist. CONTRIBUTING.md "YTKit" → "Astra
  Deck" globally; project-structure block rewritten (retired options
  page, new `_locales/` directory, scripts inventory, standalone
  userscripts). HARDENING.md header rewritten to cover the full v3.14 →
  v3.23 window with H1–H19 prior-pass preamble and Pass 19 (H20/H21)
  landing now.

### Security

- **Cache-control hardening on Astra Downloader responses (NX11, HARDENING H22).**
  CVE-2026-27205 (Flask session cache leak) is structurally inapplicable
  since we don't use Flask sessions — but every `cors_response` now emits
  `Cache-Control: no-store` and `Vary: Cookie` defensively so a future
  session-bearing variant can't inherit a stale cache entry. Flask
  pinned to `>=3.1.3,<4` in requirements.txt for the same reason. Two
  new regressions in `test_astra_downloader.py::CorsHeaderTests`.
- **CSP `connect-src` allowlist on extension pages (N5, HARDENING H20).**
  Previously `script-src 'self'; object-src 'self'` only. A compromised
  content-script or a careless future contributor wiring popup.js to
  off-self origins could exfiltrate without CSP friction. The new
  `connect-src` declares the documented host_permissions explicitly:
  `'self'`, the three AI providers (OpenAI / Anthropic / Google),
  SponsorBlock, the six Astra Downloader fallback ports, and the local
  Ollama port. No wildcards.

### Changed (extension)

- **Feature lifecycle registry bridge.** Existing feature startup,
  live-chat startup, popup live-toggle messages, settings-panel toggles,
  config reinitializers, conflict disables, external storage updates,
  and SPA page transitions now route through shared lifecycle wrappers.
  Every live feature is registered as a core-registry adapter that
  delegates to the existing `init()` / `destroy()` methods while
  publishing a `ytkit.featureHealth()` debug snapshot.
- **Storage sync audit now measures safe profiles separately.**
  `npm run audit:storage` now reports a safe-store profile sync candidate
  separately from the full UI-preferences payload. The safe-store payload
  currently measures 5.4 KB and passes Chrome `storage.sync` item limits;
  full settings are 9.4 KB and remain local-only by default.
- **Premium UI polish pass.** Toolbar popup copy is clearer and more
  trust-oriented, quick-toggle descriptions now explain outcomes instead
  of implementation, diagnostic actions reliably surface success feedback,
  and the shared popup/injected UI radius system has been tightened to
  rectangular controls with no text-bearing pill backdrops. Injected
  YouTube surfaces no longer use blur-heavy `backdrop-filter` effects,
  reducing compositing cost while keeping the dark premium visual language.
- **Reaction Spammer is opt-in now (N3).** The feature was introduced
  default-ON in v3.22.0; rapid emoji reactions risk YouTube's automated-
  behavior heuristics flagging the account. The migration v6 → v7 force-
  resets `reactionSpammer` to `false` for everyone (we can't reliably
  distinguish "user explicitly opted in" from "default-merge populated
  true" given the one-week v3.22.0 window). Users who want the feature
  re-enable in one click; the first launcher opening then surfaces a
  one-shot amber toast: "Reaction Spammer: YouTube may rate-limit or
  flag rapid reactions. Use at your own risk." The ack is persisted in
  `appState.settings._reactionSpammerAck` so the toast doesn't re-fire.
- **Reaction Spammer interval floor raised to 500 ms (N3).** Previous
  minimum was 50 ms — well under the rate at which YouTube's panel
  observer would flag rapid synthesis. Both the extension feature and
  the standalone `YT_Reaction_Spammer.user.js` userscript (bumped to
  v0.3.0) clamp at 500 ms. The settings panel input's `min` attribute
  reflects the floor too.
- **`SETTINGS_VERSION` bumped to 7** with a new migration 7 entry. Round-
  trip fixture coverage in `tests/fixtures/settings-import-roundtrip.json`
  extended to include a v6 profile alongside v1-v5.

### Changed (Astra Downloader v1.4.0)

- **SABR-aware format selection (N2).** YouTube's `web` client increasingly
  returns SABR-only `adaptiveFormats` without HTTPS playback URLs in 2026.
  Astra Downloader now passes `youtube:formats=duplicate` on every YouTube
  download so yt-dlp returns both format families and the codec-aware
  selector in `build_video_format_args` picks HTTPS when present, SABR
  otherwise. No silent breakage on SABR-only videos. Unconditional for
  YouTube URLs; no-op elsewhere.

### Added (Astra Downloader v1.4.0)

- **PO Token provider detection (N1).** Astra Downloader auto-detects a
  running [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
  HTTP server on `127.0.0.1:4416`, surfaces its health in `/health.poTokenProvider`,
  and routes yt-dlp through it via the `youtubepot-bgutilhttp:base_url=...`
  extractor-arg. The provider is opt-in — when absent, downloads still work
  on most videos, but increasingly fail with "Sign in to confirm you're not
  a bot" on the 2026 web client as YouTube binds PO tokens per video.
  README includes a docker-compose snippet for one-line setup. Detection is
  cached for 30 s; the extension popup pill that surfaces the absence ships
  in a follow-up.

---

## [3.22.0] - 8 more languages + auto-detect surfaces - 2026-05-10

### Added
- **Eight new bundled locales**: German (`de`), Spanish (`es`),
  French (`fr`), Italian (`it`), Japanese (`ja`), Korean (`ko`),
  Brazilian Portuguese (`pt_BR`), Russian (`ru`). Each ships
  ~199 translated messages (12-16 fall through to English where
  brand names or template-string placeholders apply). Combined with
  existing English and Simplified Chinese, the extension now
  bundles 10 locales.
- **`scripts/generate-locales.js`** — translation table per locale
  in one file. Adding a language = appending a `T.<locale>` map
  and running the script. Adding a key = adding it to every
  locale's table. Keeps the diff visible in code review and means
  no separate JSON files to keep in sync manually.

### Changed
- **The "Auto" option in the language dropdown now shows the
  detected language inline.** When a user with a German browser
  opens the popup, the option reads "Auto (browser default) —
  Deutsch" instead of just "Auto". Mapping covers the bundled
  locales plus their generic codes (e.g. `pt` → Português, `zh` →
  简体中文); unknown locales fall back to the BCP-47 tag.

### Auto-detection
- `chrome.i18n.getMessage()` already auto-detects the browser
  language via Chrome's i18n system (the manifest declares
  `default_locale: "en"`). Users on a German browser with no
  manual override now see Astra Deck in German automatically.
  Manual override via the popup dropdown (writes
  `chrome.storage.local._localeOverride`) still wins.

---

## [3.21.2] - Relocate language selector inline with Export/Import - 2026-05-10

### Changed
- **Language selector moved into the data-management actions row,**
  immediately after Import. The standalone "Display language" card
  between the actions row and Quick toggles is gone — the dropdown
  now sits as a third control alongside Export / Import (Reset
  stays right-aligned). Sized to match the existing 32 px button
  height so the row reads as one tight cluster.

---

## [3.21.1] - Style the language dropdown - 2026-05-10

### Fixed
- **Language dropdown was effectively invisible** in v3.21.0. The
  new `<select id="languageSelect">` shipped without any CSS for
  `.language-section`, `.language-row`, or the select itself, so
  the bare `<select>` rendered as a near-invisible system control
  against the dark popup background. Added a card frame matching
  `.quick-toggles-section` and a custom dark-themed select with
  the same flame accent colors as the rest of the popup.

---

## [3.21.0] - Simplified Chinese + i18n foundation - 2026-05-10

Resolves [#1](https://github.com/SysAdminDoc/Astra-Deck/issues/1).
Adds Simplified Chinese as a first-class display language and lays
the foundation for further locales by routing every high-traffic UI
string through `chrome.i18n.getMessage()` with an inline English
fallback.

### Added
- **Simplified Chinese (`zh_CN`) locale.** 208 translated keys
  cover the popup, the in-page settings panel header + sidebar +
  search, the download options popup, the download progress panel
  (every state — preparing / downloading / merging / complete /
  skipped / failed / lost), the speed-control popup, the player
  chrome buttons, and every quick-toggle name + description in the
  popup. Brand names ("Astra Deck", "Astra Downloader", "DeArrow",
  "SponsorBlock") and technical formats ("MP4", "M4A", "VP9") stay
  in English by convention.
- **Language dropdown in the popup.** New "Display language"
  section between data management and quick toggles: Auto (browser
  default) / English / 简体中文. Selection writes
  `_localeOverride` to `chrome.storage.local`; the popup reloads to
  apply, and the in-page UI picks up the override on next page
  navigation.
- **`t(key, fallback)` helper** in both `extension/popup.js` and
  `extension/ytkit.js`. Resolves the manual locale override first,
  falls back to `chrome.i18n.getMessage(key)`, then to the inline
  English literal so the source remains self-documenting and the
  userscript build (no `chrome.i18n`) keeps working.
- **`scripts/extract-i18n-keys.js`** — extractor that walks the
  source for `t('key', 'fallback')` references and HTML
  `data-i18n` attributes, emitting a normalized `messages.json`
  shape. Used to bootstrap the en locale and as the contract for
  future locale additions.

### Changed
- **`popup.html` strings now declarative via `data-i18n`.** Every
  static label, button, placeholder, and aria-label carries a
  `data-i18n="key"` (or `data-i18n-attr-X="key"`) attribute that
  `applyI18n()` resolves on popup boot.
- **`extension/_locales/en/messages.json` rebuilt to 208 keys** (was
  4). Manifest keys (extName, extDescription, extActionTitle,
  toggleControlCenterDesc) preserved with their `description`
  fields; everything else regenerated from the source.

### Coverage scope
This pass covers ~208 keys across the most user-visible surfaces:
popup, settings panel chrome, download UI, player chrome, and the
quick-toggle catalog. The 150+ feature-definition entries in
`ytkit.js` (each feature's name + description as shown in the
settings panel body) are still hardcoded English — those will
migrate in a follow-up Phase A.2 to keep this PR reviewable.

---

## [3.20.9] - Player speed control - 2026-05-10

### Added
- **Speed control button on the video player.** Sits in the player
  chrome between the Download button and the Settings gear. Click
  opens a 5×2 grid of speed chips (0.25× / 0.5× / 0.75× / 1× / 1.25× /
  1.5× / 1.75× / 2× / 2.5× / 3×); the chosen value applies to the
  current video immediately and persists as the default for every
  subsequent video until changed. Wires into the existing
  `persistentSpeed` feature (auto-applies on navigate via the
  feature's existing rule) so there's no second source of truth for
  the speed value. Button label shows the current speed (`1×`,
  `1.5×`, etc.) so the active default is visible at a glance.

---

## [3.20.8] - Re-downloads always run - 2026-05-10

Pairs with Astra Downloader v1.3.0. Same URL, click 100 times, get
100 downloads — the archive lock is gone.

### Removed
- `skipped` status path is gone since the server no longer emits it
  (no archive = nothing to skip). The handler stays in place
  defensively but is unreachable on the supported downloader.

---

## [3.20.7] - Surface skipped re-downloads - 2026-05-10

Pairs with Astra Downloader v1.2.3. The download progress panel now
distinguishes a skipped re-download from a successful download, so
URLs already in the archive don't silently masquerade as completed
with no file.

### Changed
- **New `skipped` status in the progress panel.** Amber state pill,
  amber toast, 8-second auto-dismiss. Surfaces the server's reason
  string ("Already in download archive — re-download skipped. Disable
  Download Archive in Settings or clear archive.txt to allow
  re-downloading.") so users know why nothing landed and how to fix
  it. Previously fell through to the success path and faked a
  completed download with no file.

---

## [3.20.6] - Native folder picker for downloads - 2026-05-10

The download popup's "Save to" row now opens a native folder picker
when you click "Change". Manual path typing is gone — paths come back
from the downloader's QFileDialog and the row reflects the chosen
folder inline. Pairs with Astra Downloader v1.2.2.

### Changed
- **"Change" button opens a native folder picker.** Previously revealed
  a text input where you had to type a Windows path. Web pages can't
  open OS folder dialogs directly (`showDirectoryPicker` returns a
  handle, not a real path), so the click round-trips through the
  downloader's new `POST /pick-folder` endpoint. Result is wired into
  the same `outputDir` field the download CTA already uses. Button
  flips to "Reset" while a custom path is set, restoring the server
  default with one click.
- **"Save to" row reads the server config in camelCase.** Previously
  read `cfg.downloadPath` while the server returned `DownloadPath` —
  the row silently fell back to the placeholder forever. The row now
  prefers `downloadPath` (new in downloader v1.2.2) and still falls
  through to the legacy `DownloadPath` so older downloader builds keep
  working. Initial state shows "Loading…" then the actual path,
  instead of the misleading "Default (Downloads)".

---

## [3.20.5] - Hardening Pass 18 - 2026-04-26

Audit-only release on top of v3.20.4. Settings-import migration
correctness, popup modal a11y + WCAG 2.2 AA audit, SponsorBlock
stale segment cache, selector-drift canary expansion to overlay
tier, deterministic storage-sync eligibility audit, i18n scaffold
with build-time validator, ESLint custom rule for MV3 SW listener
registration safety, popup health-banner clear-log button, and a
live-chat author spacing fix. No user-visible feature changes.

### Hardening

- **Settings imports now run schema migrations before writing storage.**
  Popup and in-page imports preserve the imported `_settingsVersion`,
  run migrations forward, merge generated defaults, log
  `settings-migration` diagnostics, and only then stamp the current
  schema. This prevents older backups from skipping v4-v6 migrations.
  `HARDENING.md` H11.
- **Toolbar popup now behaves as a named modal dialog.** The popup root
  exposes `role="dialog"`, `aria-modal`, and a visible title label;
  JavaScript moves initial focus into the popup, wraps Tab/Shift-Tab,
  delegates to the nested confirmation dialog, and closes on Escape.
  `HARDENING.md` H11.
- **SponsorBlock now has a bounded stale segment cache.** Segment
  fetches check a 12-hour top-level `sb_segments_cache` before hitting
  the network, cache normalized results, and fall back to 7-day stale
  entries when the API errors or times out. Stale seekbar markers are
  labelled with a cached-at tooltip, current category toggles still
  filter cached markers, and `storageQuotaLRU` caps the cache at 500
  videos. `HARDENING.md` H13.

### Testing

- **Profile import migration fixtures now cover every prior settings
  schema.** `tests/settings-migration-roundtrip.test.js` imports known
  v1-v5 profile snapshots into the current v6 schema, verifies every
  generated default key is restored, retired/unsafe keys are dropped,
  migration diagnostics are emitted, and re-imports are idempotent.
  `HARDENING.md` H12.
- **Selector drift canary now covers the player overlay tier.** The
  selector regression fixture list now pins `.ytp-progress-bar-padding`
  and `.ytp-tooltip-text` alongside the existing player controls and
  comment text wrappers, and source-side matching uses token boundaries
  so wrapper names cannot mask a missing exact selector. `HARDENING.md`
  H14.

### Tooling

- **Storage sync eligibility now has a deterministic audit.**
  `npm run audit:storage` measures Chrome-style storage bytes for the
  current UI-preferences payload, a typical long-term local payload, and
  a cap-stress payload. The current settings candidate is 7,334 bytes;
  the typical whole-local payload is 172,461 bytes and remains local-only.
  `HARDENING.md` H15.

- **`_locales/en/messages.json` i18n scaffold + build-time key validator.**
  The extension now has WebExtension i18n infrastructure. `manifest.json`
  `name`, `description`, `action.default_title`, and the keyboard command
  description use `__MSG_<key>__` references resolved at browser load time.
  A new `scripts/check-i18n.js` gate (wired into `npm run check`) verifies
  every `__MSG_` reference and `chrome.i18n.getMessage()` call resolves to
  a key in `extension/_locales/en/messages.json`. In-source English strings
  are not yet migrated — migration is incremental. `HARDENING.md` H16.

- **ESLint custom rule added: no non-top-level `addListener` in `background.js`.**
  `eslint` added as a devDependency with a flat config targeting the MV3
  service worker. The custom rule `no-post-await-addlistener` flags any
  `chrome.*.addListener()` call nested inside an `async` function or
  `.then()` callback — both patterns are unreliable in MV3 because the SW
  may be terminated before the listener registers. All four existing
  registrations in `background.js` are top-level and clean. `npm run lint`
  added; wired into `npm run check`. `HARDENING.md` H18.

- **Popup health banner now has a "Clear" button for the diagnostic log.**
  Previously the only path to clear `_errors` (TrustedTypes + migration
  diagnostics) was the full Reset-all-data action. A neutral-styled Clear
  button in the health banner reads `ytSuiteSettings._errors` from storage,
  deletes it, and re-renders the banner after user confirmation. The Copy
  button is unchanged. `HARDENING.md` H17.

- **WCAG 2.2 AA accessibility audit of the toolbar popup.**
  Build-time audits for color contrast (`npm run audit:contrast`) and
  popup a11y (`npm run audit:a11y`) now verify the health banner meets
  WCAG AA (14.16:1 contrast), all buttons are labelled (aria-label or
  visible text), focus-visible CSS covers all interactive controls
  (button, input, textarea, .toggle, etc.), and keyboard navigation
  preserves focus traps. All checks pass. Both audits wired into
  `npm run check`. `HARDENING.md` H19.

## [3.20.4] - Hardening Pass 11 - 2026-04-25

Third factory-loop pass on top of v3.20.3. One real resource-leak
fix (EXT_FETCH no longer keeps the SW socket alive after responding
with "too large") and one developer-experience improvement
(local pre-push version-drift check). No user-visible feature
changes — charter remains "no further features planned."

### Hardening

- **EXT_FETCH proxy aborts the underlying fetch on every size-limit
  early-return.** Two of five paths in the proxy used to leave the
  fetch open after we'd already responded with "too large" to the
  caller — the streamed-too-large path called `reader.cancel()` only
  (which closes the reader but doesn't always tear down the network
  request) and the non-streaming-too-large path did neither. Both
  meant the SW kept reading bytes off the wire long after we'd
  responded. All five paths (timeout, redirect-off-allowlist,
  content-length, streamed body, non-streaming body) now consistently
  call `controller.abort()`. `HARDENING.md` H9.

### Tooling

- **`npm run check` now catches version-string drift pre-push.** The
  `Build & Release` workflow already validates that
  `package.json`, `extension/manifest.json`,
  `extension/ytkit.js#YTKIT_VERSION`, and `YTKit.user.js#@version`
  agree with the pushed tag — but only AFTER the tag has landed on
  remote. New `scripts/check-versions.js` ports the same comparison
  to local-side; failure output lists per-source values and a
  remediation hint pointing at `node sync-userscript.js`. Wired into
  `npm run check` (so `npm test && npm run check` is now sufficient
  pre-push) and exposed standalone via `npm run check:versions`.
  `HARDENING.md` H10.

## [3.20.3] - Hardening Pass 10 - 2026-04-24

Second factory-loop pass on top of v3.20.2. One real bug fix
(theater-split divider-drag memory leak across SPA nav), one
testability widening (selector canary 9 → 18), one wire-contract
clarification (cookie-jar `expirationDate` helper). No user-visible
feature changes — charter remains "no further features planned."

### Hardening

- **Cookie-jar wire contract is now explicit.** Three sites previously
  inlined `expirationDate: c.expirationDate || 0` — `extension/ytkit.js`
  (MediaDL cookie mapper), `extension/background.js`
  (`EXT_COOKIE_LIST` handler), and `YTKit.user.js` (GM_cookie fallback).
  All three now call a named `normalizeCookieExpiry(value)` helper that
  documents the wire contract: session cookies → 0, persistent cookies
  → positive Number seconds since epoch, anything else → 0. JS output
  round-trips cleanly through the Python downloader's
  `int(float(x))` parsing. Three regressions in
  `tests/hardening.test.js` pin parity across all three sites and the
  Python wire round-trip. `HARDENING.md` H6.
- **Selector-drift canary expanded from 9 to 18 selectors.** Adds layout
  (`ytd-watch-metadata`, `ytd-comments`), player chrome
  (`ytp-play-button`, `ytp-settings-button`, `ytp-fullscreen-button`,
  `ytp-time-display`), the new comments-DOM shape
  (`ytd-comment-view-model`), and both text-rendering wrappers
  (`yt-formatted-string`, `yt-attributed-string`). Iter-3 research
  surfaced YouTube selector-churn moving from quarterly to weekly
  cadence (server-side ad injection + DOM-fingerprinting arms race);
  the wider canary lowers the probability of a silent break shipping
  to users.
- **Theater Split userscript v1.0.6 → v1.0.7 closes a divider-drag
  leak across SPA navigations.** The drag attached `mousemove` /
  `mouseup` to `window` and a position:fixed shield to `document.body`;
  the only cleanup path was the mouseup handler. If
  `yt-navigate-finish` fired between mousedown and mouseup, teardown()
  removed the split wrapper but the window listeners + shield orphaned
  and held references to disposed nodes for the rest of the session.
  v1.0.7 hoists the drag handles to module scope, adds an idempotent
  `abortDividerDrag()` helper, calls it from `teardown()`, and
  defensively pre-clears in `mousedown`. Three regressions in
  `tests/hardening.test.js`. `HARDENING.md` H8.

## [3.20.2] - Hardening Pass 9 - 2026-04-24

Follow-on audit pass from the factory-loop run. No user-visible
feature changes — charter remains "no further features planned."
This pass closes three observability gaps and one dead-code finding:

### Security / Observability

- **TrustedTypes `createPolicy()` failures are now surfaced to
  DiagnosticLog.** The TrustedHTML IIFE in `extension/ytkit.js` used
  to swallow `createPolicy('ytkit-policy', …)` throws silently, so
  peer-extension collisions on the policy name and CSP-forbidden
  policy creation were invisible in the field — the userscript fell
  back to DOMParser with no signal in the ring buffer. Failures are
  tagged `TT_UNAVAILABLE` (Firefox / no TrustedTypes) or
  `TT_POLICY_FAIL: <ErrorName>: <message>` (policy throw); the error
  message has `http(s)://…` URLs redacted before logging. Logging is
  lazy (first `setHTML` / `create` call) so `appState.settings` is
  guaranteed ready. Four regressions in `tests/hardening.test.js`.
- **Toolbar popup now surfaces the TrustedTypes diagnostic signal.**
  The popup reads `ytSuiteSettings._errors` on render, filters for
  entries tagged `ctx === 'trusted-types'`, and paints a conditional
  warning-toned banner with event count + latest URL-redacted message.
  A Copy button drops a structured payload on the clipboard so bug
  reports include the precise reason code rather than a vague "it
  broke." Banner stays hidden on the happy path (role=status,
  aria-live=polite). Four regressions in `tests/hardening.test.js`.

### Hardening

- **Python deps upper-bounded.** `astra_downloader/requirements.txt`
  now pins `PyQt6>=6.6.0,<7`, `flask>=3.0.0,<4`, `requests>=2.31.0,<3`,
  `waitress>=3.0.0,<4`. Prevents silent major-version bumps in dev/CI
  pip resolves from landing on PyQt7 / Flask 4 / requests 3 without
  a deliberate migration. Rationale per-dep in `HARDENING.md` H2.
- **`storageQuotaLRU` stale `deArrowCache` reference removed.** The
  prune loop iterated `appState.settings.deArrowCache` — a key that
  never existed. DeArrow's branding cache lives under the top-level
  `chrome.storage.local` key `da_branding_cache`, not inside the
  settings object. The dead cap entry is gone; the loop now also
  sweeps the real top-level key (belt-and-suspenders over DeArrow's
  internal 2000-entry cap) and the feature description names the
  actual key. Two regressions in `tests/hardening.test.js`.

### Tests / Tooling

- **Selector-drift canary added.** `scripts/build-selector-fixtures.js`
  decodes the gitignored `mhtml/` reference captures into compact
  token fixtures under `tests/fixtures/*.tokens.txt` (~15 KB total).
  `tests/selector-regression.test.js` asserts that 9 critical YT
  selectors (`ytd-app`, `ytd-watch-flexy`, `movie_player`,
  `html5-video-container`, `ytp-chrome-bottom`, `ytp-progress-bar`,
  `ytd-rich-grid-renderer`, `ytd-rich-item-renderer`,
  `ytd-comment-thread-renderer`) appear in BOTH the fixtures AND
  `extension/ytkit.js`. Two-sided assertion means a YouTube DOM
  rename OR an internal refactor regression surface here before
  shipping. Run `npm run build:fixtures` after refreshing `mhtml/`.

### Chore

- `.gitignore` now covers `.claude/`, `.codex/`, `.factory/`,
  `docs/research/`, and the underscore spelling of
  `CODEX_CHANGELOG.md` alongside the existing dashed form.

## [3.20.1] - Hardening Pass 8 - 2026-04-24

Audit-only follow-up to Pass 7. Closes the two remaining roadmap
audit-pass items that had concrete, bounded fixes: the LOW security
finding on `_pendingReveals` lifetime, and the SponsorBlock POI
category correctness note. Also bumps a build-time dep to clear an
npm audit moderate advisory.

### Security

- **`protocol-buffers-schema` bumped to 3.6.1** (GHSA-j452-xhg8-qg39,
  prototype pollution). Build-only transitive dep via
  `crx3 → pbf → resolve-protobuf-schema`, never shipped to users,
  but `npm audit` is now clean.

### Fixed

- **`_pendingReveals` pruned on `chrome.downloads.onErased`.** The
  Pass 7 session mirror guaranteed reveals survived a service-worker
  restart, but a download that was cancelled + erased (or wiped by
  crash recovery) before reaching `state.complete` / `state.interrupted`
  left its id in the `Set` and the session mirror forever. The new
  `onErased` listener awaits the same hydration promise as `onChanged`,
  removes the id, and persists the delete. `Set.delete` is idempotent,
  so a normal complete → erase sequence is a safe no-op on the second
  fire. Listener is guarded behind `chrome.downloads?.onErased?.addListener`
  for older Firefox builds. Regression in `tests/hardening.test.js`.
- **SponsorBlock `poi_highlight` is a marker, never an auto-skip target.**
  Per the SponsorBlock API, `poi_highlight` is a jump-to reference, not
  a segment to scrub past. The previous code path treated it identically
  to `sponsor` / `selfpromo` / `interaction` — `video.currentTime = end`.
  Both `sponsorBlock._checkSkip` and `_scheduleNextSkip` now short-circuit
  the category explicitly; the progress-bar renderer continues to paint
  the marker. The category is still off by default (`sbCat_poi_highlight: false`),
  and zero-length POI entries are still dropped on ingest, but enabling
  the toggle from the settings UI no longer fast-forwards through the
  highlight. Regression in `tests/hardening.test.js`.

---

## [3.20.0] - Hardening Pass 7

Audit-only release. Closes three of the open items from the 2026-04-23
audit pass, lifts the `chrome.storage.local` ceiling for long-term
users, and stops Firefox users from triple-binding the built-in
"Show Downloads" shortcut.

### Fixed

- **`_pendingReveals` survives service-worker restarts.** The "show in
  folder" reveal for `chrome.downloads.download({ showInFolder: true })`
  used an in-memory `Set` only. If the MV3 service worker was terminated
  between the download being queued and the `state.complete` transition,
  the reveal was silently dropped. The Set now mirrors into
  `chrome.storage.session`, the onChanged listener awaits a one-time
  hydration promise on SW cold-start, and the DOWNLOAD_FILE handler
  persists every add. Regression test in `tests/hardening.test.js`.
- **`astra_downloader._run_download` dead code removed.** The
  `re.search(r'\[download\] Downloading video …', line)` match was
  assigned to `m` and never read — leftover from an earlier title-
  detection draft. Deleting it keeps the hot log-parsing loop focused
  on filename detection + progress.
- **Theater Split userscript honours the new comment DOM.** YouTube's
  Polymer renderer now wraps comment text in `yt-core-attributed-string`;
  split-theater CSS and the `isSplitCommentTextTarget` selector chain
  didn't match it, so text selection silently broke on the current
  rollout. CSS rulesets for `pointer-events`, `user-select`, and
  `cursor` now cover the new class, and a capture-phase `selectstart`
  listener stops the autoscroll handler from swallowing the selection.
  Shipped as `theater-split.user.js` v1.0.6.

### Added

- **`unlimitedStorage` permission.** Watch history, DeArrow cache, and
  `storageQuotaLRU` can collectively push `chrome.storage.local` past
  the 10 MB default for long-term users. Declaring `unlimitedStorage`
  removes the ceiling without changing any other permission surface.
  LRU continues to trim hot caches on its 5-minute cadence.

### Changed

- **Firefox rebinds `toggle-control-center` to `Ctrl+Alt+Y`.** Firefox
  reserves `Ctrl+Shift+Y` for "Show Downloads", which previously shadowed
  the Astra Deck toggle shortcut. The Chrome manifest keeps the original
  binding (no vendor conflict there); the Firefox manifest-patch step in
  `build-extension.js` rewrites only the Firefox staged copy. Users can
  still remap via `about:addons` → Manage Extension Shortcuts.

### Tests

- 84/84 JS tests pass (+4 new Pass 7 regressions:
  `_pendingReveals` session mirror, `unlimitedStorage` permission,
  Firefox shortcut patch, dead-regex removal).
- 37 Python tests + 10 subtests still pass.

---

## [3.19.0] - Toolbar popup absorbs the options page

The standalone settings page (`chrome-extension://…/options.html`) is gone.
All of its functionality — export/import backup, reset-all-data, storage
statistics, and version chip — now lives inside the toolbar popup, styled
in the flame-accented workspace language the options page introduced. The
popup grew slightly (360×560 → 420×600) to fit the hero, stat grid, data
actions, and quick-toggle list in one surface.

### Removed
- `extension/options.html`, `extension/options.js`, and the
  `options_ui` block in `manifest.json`. Users reach full settings via the
  in-page YouTube workspace (same flow as before). The Settings Editor
  modal that rendered every 150+ setting in a separate tab is retired; the
  in-page control centre on YouTube tabs remains the authoritative editor.
- The popup's secondary "Settings Editor" ghost button (it opened the
  removed options page).

### Added
- **Hero workspace card** at the top of the popup — flame-accented
  header, brand name + version chip, "Settings workspace" eyebrow, and
  the primary "Open Full Settings" CTA inside the card.
- **Storage overview** — five live-updating stat cards (Keys, Storage,
  Hidden, Blocked, Bookmarks) that refresh on every `chrome.storage`
  change.
- **Data actions row** — Export, Import, Reset. Export uses
  `chrome.downloads.download` when available so the JSON lands in the
  user's downloads folder even after the popup closes. Reset now shows
  an in-popup confirmation dialog matching the options page's tone.
- **Quick toggles section** given its own framed panel with an eyebrow
  header + live count so data controls and quick toggles read as two
  related but distinct surfaces.

### Changed
- Popup theme tokens synced to the options page: same page background,
  workspace card gradient, stat card treatment, flame accent, focus ring.
- `background.js#togglePanelForTab` opens a new YouTube tab when the
  panel-toggle message can't be delivered, instead of calling the
  now-removed `chrome.runtime.openOptionsPage()`.
- Popup context model simplified — the `showSecondary` flag and the
  secondary footer button are gone.

### Tests
- 80/80 passing. `tests/hardening.test.js` rewritten around the new
  popup: removed options-source invariants, added a regression test that
  fails if `options_ui`, `options.html`, or `options.js` ever come back;
  relocated the export/import-parity check to run against `popup.js`.

---

## [3.18.0] - Premium-aware Auto Quality (no popup flash)

Auto Quality rewritten end-to-end. The previous implementation opened
YouTube's player settings menu via DOM clicks, walked the Quality
submenu, and clicked the highest item — hiding the popup with CSS for a
brief window. When the click sequence finished but YouTube didn't auto-
close (or timing slipped), the menu became visible to the user.

The new implementation calls `movie_player.setPlaybackQualityRange()`
directly from the MAIN-world bridge — the same API used by Auto-HD-FPS,
Iridium, Enhancer for YouTube, and the popular YouTube HD Premium
userscript. There is no gear-menu interaction at any point, so there is
nothing to flash.

### Changed
- **Always Best Quality** (renamed from Auto Quality) — single toggle.
  No dropdown. Picks the highest non-`auto` entry from
  `getAvailableQualityData()` and prefers any entry whose `qualityLabel`
  contains "Premium" (so 1080p Premium / Enhanced Bitrate is selected
  automatically when the account/video offers it). Falls back to legacy
  `getAvailableQualityLevels()` when the newer API is missing.
- The ISOLATED content script now only flips `<html data-ytkit-quality="on">`.
  All quality logic lives in `ytkit-main.js`, which listens for
  `loadstart` / `loadedmetadata` / `canplay` on the video element plus
  `yt-navigate-finish` and `yt-page-data-updated`. Re-application is
  deduplicated per `videoId:quality:label`.
- Userscript build (`YTKit.user.js`) injects an inline `<script>` with the
  same Premium-aware forcer so it works under any userscript manager
  regardless of injection mode.

### Removed
- `preferredQuality` setting (the dropdown — now always best).
- `useEnhancedBitrate` sub-feature (Premium is detected automatically).
- `hideQualityPopup` sub-feature (no popup is ever opened).
- `_setQualityViaDOM`, `_temporarilyHideQualityPopup`, `_closeSettingsMenu`,
  `_releasePopupHider`, the retry-timer schedule, and the watchdog interval.
  All kept as RETIRED keys via `RETIRED_SETTING_KEYS` so existing user
  storage is sanitized on next load. Migration v6 drops them from
  exported settings snapshots.

### Settings schema
- `SETTINGS_VERSION` 5 → 6 with no-op-style migration that strips the
  three retired keys.

### Tests
- 84/84 pass. The v3.14.0 hardening regression that asserted the gear-
  click `selectorChain` adoption was rewritten to assert the new
  invariant: ISOLATED sets `data-ytkit-quality`, MAIN calls
  `setPlaybackQualityRange` + `getAvailableQualityData` with Premium
  detection, and the gear-menu DOM-click path stays deleted.

---

## [3.17.0] - Alchemy-inspired additions (Wave 10)

Eleven new features imported after a feature review of the YouTube Alchemy
userscript. Every toggle is **OFF by default** so existing setups are
unchanged — users opt in from Settings. Grouped under a new "Wave 10"
block at the end of the features array for easy isolation.

### Added — CSS-only toggles (fast, zero-cost)
- `hideAirplayButton` — remove Airplay icon from player controls.
- `hideQueueOnThumbnails` — remove "Add to queue" hover button on grid items.
- `fullTitles` — unclamp the 2-line truncation on thumbnail titles.
- `titleCaseTransform` + `titleCaseMode` (select: `none` / `uppercase` /
  `lowercase` / `capitalize`) — override YouTube's SHOUTY UPPERCASE titles.
- `customSelectionColor` + `selectionColor` (color picker) — override the
  default `::selection` background.

### Added — Behaviour toggles
- `bypassPlaylistMode` — capture-phase click handler strips `&list=` /
  `&index=` / `&pp=` from thumbnail anchors so videos don't trap you inside
  someone's playlist.
- `musicVideoSpeedLock` — when Persistent Playback Speed is on, detects
  music-category videos and forces 1× so songs aren't sped up.

### Added — DOM features
- `playlistQuickRemove` — trash-icon overlay on each item in playlists you
  own; click-chains the native "Remove from playlist" menu item. Appears
  only on owned playlists (detected via the presence of the edit action).
- `watchLaterCleanup` — injects a "Remove Watched" button into the Watch
  Later playlist header (only on `?list=WL`). Removes items with ≥90%
  progress via the native menu path, sequentially with a 350 ms gap to
  let YouTube's Polymer mutations process.

### Added — Complex features
- `transcriptAiHandoff` + `transcriptAiTarget` (select: `notebooklm` /
  `chatgpt` / `claude` / `gemini` / `perplexity`) — adds a sparkle button
  to the player right-controls. Click fetches the transcript via the
  existing `TranscriptService`, builds a summary prompt, copies to
  clipboard, and opens the chosen AI tool. ChatGPT uses its native `?q=`
  URL for a pre-filled prompt (truncated to 6 KB); others open their
  landing page and the user pastes. No API key required.
- `audioTrackLanguage` + `preferredAudioLang` (24-locale select) — on
  every nav, drives the player's Settings → Audio Track menu to select
  the requested language. Silently no-ops when the video has no alternate
  audio track (single-track videos, Shorts, music).

### Settings plumbing
- `SETTINGS_VERSION` bumped 4 → 5. Migration v5 is a no-op marker — new
  defaults seed via the existing merge-during-load path (additive, so the
  marker exists only to advance `_settingsVersion` cleanly for future
  migrations).
- All 15 new keys regenerated into `default-settings.json` via the
  existing `build-extension.js` brace-balanced parser. No code changes
  to the settings-UI renderer needed — the `type: 'select' | 'color'` +
  `settingKey` pattern is already wired.

### Notes
- Parse-clean (new Function() validates). All 81 existing JS tests pass.
- Build artifacts regenerated: Chrome ZIP + CRX, Firefox ZIP + XPI all at
  375 KB.
- Competitor-review source: Alchemy's audio-track picker, header quick
  links (already covered by Astra Deck's `quickLinkMenu`), tab view
  (covered by `watchPageTabs`), and the colored transcript buttons
  (subsumed into the single `transcriptAiHandoff` selector-driven design).

---

## Astra Downloader [1.3.0] - Re-downloads always run

Removes the download-archive lock entirely. Same URL, click 100
times, get 100 downloads. Resolves the broader UX failure where the
archive feature silently blocked re-downloads — the v1.2.3 "surface
skipped re-downloads" patch made the failure visible, but the
underlying request ("just download it again, don't lock me out") is
better served by removing the lock.

### Removed
- `--download-archive` argv branch from `_run_download`.
- `DownloadArchive` config key (DEFAULT_CONFIG, sanitizer tuple, save
  path).
- `cfg_archive` checkbox from the Settings tab.
- v1.2.3 archive-skip detection and the `skipped` post-loop branch.
- `archive.txt` is unlinked on first launch of v1.3.0 so it doesn't
  hang around in `%LOCALAPPDATA%\AstraDownloader`.

### Added
- `--force-overwrites` to yt-dlp argv. Without it, yt-dlp refuses to
  overwrite an existing output file and prints "[download] Title.mp4
  has already been downloaded" — same UX failure as the archive lock.
- `NoArchiveLockTests`: pins the invariants (no `DownloadArchive`
  key, no `--download-archive` argv, `--force-overwrites` present)
  so the lock can't be silently re-introduced.

---

## Astra Downloader [1.2.3] - Distinguish skipped re-downloads

Bug-fix on top of v1.2.2. URLs already in the download archive no
longer masquerade as successful downloads with no file.

### Fixed
- **`'already been downloaded'` from yt-dlp now flips status to
  `skipped`, not `complete`.** With `DownloadArchive: true` (the
  default), re-downloading a URL already in `archive.txt` makes
  yt-dlp skip the download entirely. The previous handler set
  `status = "complete"` with `filename = ""`, so the extension's
  progress panel claimed success while no file ever appeared. Now
  sets `status = "skipped"` with a clear `error` string explaining
  why and how to re-enable. Also excluded from history (no actual
  file was produced) and from the post-loop fallback that would
  otherwise overwrite the status.

---

## Astra Downloader [1.2.2] - Native folder picker + Videos default

Companion bug-fix on top of v1.2.1. Adds a cross-thread folder picker
endpoint so the extension popup can open a real OS dialog instead of
making users type a Windows path, and changes the default download
directory from `~/Videos/YouTube` to `~/Videos` (one fewer subfolder
to click into when importing into Premiere/Resolve/FCP).

### Added
- **`POST /pick-folder` endpoint.** Pops a native QFileDialog on the
  GUI thread (Qt widgets are GUI-thread only; Flask handlers run on
  waitress workers, so requests are pumped through a queue + 150 ms
  QTimer poll on the GUI thread). Dialog is forced on top via
  `WindowStaysOnTopHint` because the downloader runs tray-only by
  default and has no parent window to anchor to. Returns
  `{ path, cancelled }` or `{ error }`. 120 s timeout.
- **camelCase aliases on `/config`** — `downloadPath` and
  `audioDownloadPath` mirror the existing capital-case keys so JS
  callers can use conventional casing. Capital keys remain for
  backward compatibility.

### Changed
- **Default `DownloadPath` is now `~/Videos`** (was `~/Videos/YouTube`).
  Existing configs are not migrated — users on the old default keep
  the YouTube subfolder until they reset or pick a new folder.

---

## Astra Downloader [1.2.1] - Editor-compatible MP4/WebM downloads

Bug-fix release on top of v1.2.0. Restores codec/container alignment so
files downloaded as MP4 are actually H.264 + AAC (Adobe Premiere /
Final Cut / DaVinci Resolve native import), and WebM downloads are
VP9 + Opus.

### Fixed
- **MP4 downloads now produce Premiere-compatible files.** The previous
  `bestvideo+bestaudio` selector picked the highest-bitrate stream
  regardless of codec (almost always VP9 or AV1 on YouTube), and
  `--merge-output-format mp4` only swapped the container — leaving
  VP9/AV1 video inside `.mp4`. Adobe Premiere rejects that combination
  as "unsupported compression". The new `build_video_format_args` cascade
  prefers `vcodec^=avc1` + `ext=m4a` for MP4, `vcodec^=vp9` + `ext=webm`
  for WebM, and falls through to plain `best` so a download never fails
  purely on codec. MKV remains codec-free (universal container).
- Note for >1080p MP4 downloads: YouTube only serves AVC1 up to 1080p,
  so the cascade falls through to AV1/VP9 above that. Pin quality to
  1080p (or lower) for guaranteed Premiere import, or pick MKV.

### Tests
- 42 Python tests pass (was 37). New suite: `VideoFormatSelectorTests`
  pins the codec preferences per container so the regression can't
  return silently.

---

## Astra Downloader [1.2.0] - Hardening Pass 6 (companion service)

Deep audit of the Python/Flask `astra_downloader` companion. Clears every
named Pass 6 follow-up from HARDENING.md plus a batch of new findings.
Extension wire-compatible (`/health` gains three additive keys, older
builds ignore unknown keys).

### Added
- **Path confinement on `/download`** (S1). Client-supplied `outputDir` is
  now bounded to `DownloadPath` + `AudioDownloadPath` + optional
  `ExtraOutputRoots`. Resolved before `mkdir`, so a rejected request no
  longer leaves a directory behind.
- **`/download` rate limit** (S2). Token-bucket sliding window (30 / 60 s
  default). Rejection happens before body parsing; CPU stays flat under
  abuse. 429 responses include `Retry-After`.
- **SHA-256 verification for yt-dlp + ffmpeg** (S3). First-run downloads
  verify against the upstream release sidecar. Hard-fail on mismatch
  (file unlinked so retry re-downloads). Soft-fail on missing sidecar
  (logged, install continues).
- **Settings → Tools section.** Shows live `yt-dlp` / `ffmpeg` versions,
  "Check yt-dlp Update" button (runs `-U`, refreshes version cache), and
  "Reinstall ffmpeg" (unlink + re-run the verified download path).
- **ffmpeg download byte-level progress** (U1). Setup bar now advances in
  the [35, 55] range as the zip streams, throttled to ~10 Hz.
- **JSON progress template for yt-dlp output** (U3). `MDLP_JSON` lines
  parsed in addition to legacy MDLP regex — insulates against upstream
  format drift.
- **`/health` additions.** `ytDlpVersion`, `ffmpegVersion`, `rateLimit`
  policy object. Extension consumers can render versions in the repair
  prompt.
- **`Access-Control-Max-Age: 600`** (R2) — preflight cache horizon cuts
  CORS round-trips during multi-video sessions.
- **Config fields:** `LastYtDlpUpdateCheck`, `LastFfmpegCheck`,
  `ExtraOutputRoots`.

### Changed
- **Waitress replaces werkzeug** as the WSGI server (R1). `_ServerAdapter`
  shim presents uniform `run()` / `stop()`; werkzeug remains as a last-
  resort fallback when waitress isn't installed. Server-start log reports
  the active backend.
- **yt-dlp auto-update throttled to once per 24 h** (R3). Previously fired
  on every launch with no result logging. New `maybe_auto_update_ytdlp()`
  runs in a daemon thread, captures exit code + output, invalidates the
  version cache on success.
- **`ensure_system_integrations()` is idempotent** (R5). Writes a version
  stamp to `HKCU\Software\Classes\AstraDownloader\IntegrationsVersion`
  after successful registration; subsequent launches at the same version
  skip the shortcut / schtasks / winreg / protocol passes.
- **`_bootstrap` installs waitress** alongside PyQt6 / flask / requests.

### Security
- Orphan session cookie jars (`.cookies.*.txt`) from crashed downloads
  are swept on `DownloadManager` init (R4). 5-minute horizon preserves
  in-flight jars.
- Rate limiter decouples CPU cost from client request rate.
- SHA-256 verification closes the integrity gap on first-run binaries.

### Fixed
- Setup worker now logs crash context (`log_crash`) on exception instead
  of dropping the traceback.
- Icon download failure logged instead of silently swallowed.

### Tests
- 37 Python tests pass (was 19). New suites: `PathConfinementTests`,
  `RateLimiterTests`, `Sha256VerifyTests`, `CookieJarSweepTests`,
  `ApiRateLimitTests`, `CorsHeaderTests`, `HealthAdditionsTests`,
  `AutoUpdateThrottleTests`.
- 81 JS tests unchanged (no extension behavior touched).

See [HARDENING.md](HARDENING.md) v1.2.0 section for the full audit.

---

## [3.16.1] - Remove Workspace summary card from settings sidebar

Settings panel reclaimed ~180 px of vertical space by removing the "Workspace / Home controls" summary card (kicker + title + copy + 3 stat counters + "Live apply" footnote). The section was decorative — the stats (enabled count, total features, populated sections) added no actionable information that wasn't visible elsewhere in the panel.

### Removed
- `<section class="ytkit-sidebar-card">` DOM construction in `ytkit.js` (~56 lines).
- The 4 computed variables that fed it (`totalTopLevelFeatures`, `enabledTopLevelFeatures`, `populatedCategoryCount`, `currentPageLabel`) — each was read only by the card, so removing the card made the computations dead weight.

### Notes
- CSS rules for `.ytkit-sidebar-card*` classes remain in the stylesheet, unused. They're one-line declarations each; left in place in case a future stat strip wants to reuse the styling. Can be pruned in a future cleanup pass.
- No behavioral change to any feature — only the summary card was touched.

---

## [3.16.0] - Baked-in UI preferences (no more Stylebot + uBlock needed)

Rolls the maintainer's previously-external Stylebot CSS overrides and uBlock element-hiding rules into `extension/early.css`. Clean installs now reproduce the intended compact-settings, no-avatars, no-shelf look without two extra extensions.

### Changed — settings panel chrome
- `.ytkit-brand-intro`, `.ytkit-brand-badges`, `.ytkit-search-container`, `.ytkit-pane-header`, `.ytkit-nav-count`, `.ytkit-shortcut`, `.ytkit-version` are hidden in the in-page settings panel.
- `.ytkit-nav-btn` margins/padding zeroed and `.ytkit-nav-list` given a `-10px` vertical margin so more feature toggles fit in view.
- `.ytkit-global-toast` suppressed; inline status banners and `diagnosticLog` still surface feedback.
- `.ytkit-subs-load-banner` hidden on the subscriptions feed.
- Watch-page owner row (`ytd-video-owner-renderer`) gets a `margin-top: 10px` to keep the collapsed header from crowding the title.

### Changed — YouTube page chrome
- Skeleton / continuation placeholders removed: `ytd-ghost-grid-renderer`, `ytd-continuation-item-renderer` inside `ytd-rich-grid-renderer`.
- Rich-section shelves removed: the outer `ytd-rich-section-renderer` wrapper and its inner `div.style-scope.ytd-rich-section-renderer`.
- Avatars collapsed site-wide: `img.style-scope.yt-img-shadow` is hidden, plus the watch-page owner-row wrapper `yt-img-shadow.ytd-video-owner-renderer.no-transition`.

### Notes
- All rules are injected at `document_start` via `early.css`, so they apply before YouTube's first paint.
- Rules use `!important` to defeat YouTube's and the extension's own inline styles without needing specificity tuning.
- The upstream Stylebot line `a.yt-simple-endpoint.style-scope.yt-formatted-string { margin-bottom: -px; }` was dropped because `-px` is not a valid CSS length. Drop-in a concrete value (e.g. `-4px`) to restore that tweak.
- Opt-out path: if any of these ever need to become user-toggleable, re-scope the selectors under a `body.ytkit-cleanUi` class the same way `body.ytkit-hideEndCards` etc. gate the existing rules in `early.css`.

---

## [3.15.0] - Hardening Pass 5 — Repo-wide deep audit

End-to-end audit covering the Python downloader, build system, CI pipeline, and ancillary scripts. Ships coordinated fixes across three surfaces the v3.14.0 pass didn't touch.

### Security (Astra Downloader / Flask API)
- **DNS-rebinding defense** (`astra_downloader.py`) — added a `before_request` Host-header check that rejects any request whose Host isn't `127.0.0.1`, `localhost`, or `[::1]` (with or without a port). A malicious webpage that rebinds `attacker.com` to the downloader's port now receives `421 Misdirected Request` before any route handler runs. Protects the token-discovery path on `/health` and every authenticated endpoint.
- **`/health` token-disclosure trust boundary documented** — the Host check is the primary defense; the extension-origin + no-Origin paths are preserved for legitimate local tooling (curl, the GUI's own health probe). Comment at the handler explains the defense-in-depth layering so a future refactor doesn't remove the wrong piece.
- **IPv6 literal host support** — the Host parser handles `[::1]:9751` correctly so IPv6 clients aren't erroneously rejected.

### Reliability (Astra Downloader)
- **`_bootstrap()` surfaces install failures** — previously every pip install strategy silently fell through to an `ImportError` on the subsequent imports, hiding the real cause (missing pip, blocked PyPI, proxy). The helper now captures the last failure and writes a pointed `[Astra Downloader] Failed to auto-install dependencies (...)` message to stderr with the exact manual command to run.
- **`FileNotFoundError` short-circuits retries** — if `python -m pip` can't locate pip at all, we stop iterating through strategies since retrying won't help.

### Rebrand / Link Hygiene
- **12 hardcoded `SysAdminDoc/YouTube-Kit` URLs migrated to `Astra-Deck`** across `build-extension.js`, `sync-userscript.js`, `YTKit.user.js` (update/download URLs, GitHub link, installer URL, nyan cat asset, installer .bat emission), `theater-split.user.js` (namespace + update/download), `CONTRIBUTING.md`, `package-lock.json`. Userscript auto-updaters (Tampermonkey, Violentmonkey) cached the old URL and were relying on GitHub's redirect; the direct URL is now canonical.
- **CONTRIBUTING.md project tree** updated to say `Astra-Deck/` not `YouTube-Kit/`.

### CI / Release Pipeline (`.github/workflows/build.yml`)
- **Tag-vs-version check expanded** — was only comparing `manifest.json`. Now also verifies `ytkit.js` `YTKIT_VERSION`, `YTKit.user.js` `@version`, and `package.json`. Any drift across the four version strings fails the release build before artifacts are uploaded.
- **Artifact name renamed** from `YouTube-Kit-build-artifacts` to `astra-deck-build-artifacts`.

### Tests
- **2 new Python tests** — `test_dns_rebinding_attack_is_rejected_before_handler` covers the Host validation with 3 attack hosts and 3 legitimate hosts (IPv4, localhost, IPv6); `test_bootstrap_surfaces_failure_to_stderr` asserts the helpful stderr message is emitted when all pip strategies fail. Total: 15 Python tests pass.
- **10 new JS hardening regression tests** in `tests/hardening.test.js` — capture v3.14.0 invariants so future refactors can't silently regress the fixes: ReDoS guard (alternation coverage), `applyImportedSettingsVersion` preserving exporter version, `importSettings` routing through the migration-aware helper, `selectorChain` helper shape + `all:true` + first-miss logging, adoption at macro-markers (2 sites) and player settings button, `getSetting` null-safety, `chrome.downloads.onChanged` reveal path, zero empty `catch (_) {}` blocks across extension source, `diagnosticLog.destroy()` clearing `_errors`. Total: 47 JS tests pass (was 37).
- **`tests/repo-paths.test.js` updated** to assert the new `Astra-Deck` URL pattern.

### Documentation
- **`HARDENING.md`** — extended with Pass 5 section.
- **README badge** bumped to 3.15.0.
- **CHANGELOG**, **CLAUDE.md**, memory file — synced.

---

## [3.14.0] - Hardening Pass 4

Deep audit pass — correctness, MV3 lifecycle, platform-drift resilience. No new features; see `HARDENING.md` for findings, including false-positive list retained so future audits don't re-raise the same noise.

### Fixed
- **ReDoS guard in video-title filter** (`ytkit.js:videoHider`) — broadened to reject alternation-wrapped quantifier stacks like `(a|b+)+` and `(foo|bar*)+`. The previous guard only caught `(a+)+`-style patterns, leaving a path for malicious paste into `hideVideosKeywordFilter` to stall grid rendering.
- **Profile import preserves `_settingsVersion`** (`options.js:applyImportedSettingsVersion`) — imports no longer stamp the current schema version over whatever the exporter wrote. Imports from an older schema now run through the runtime's migration chain from the exported version forward, instead of silently bypassing it.
- **`chrome.downloads.show` reveal** (`background.js`) — switched from `setTimeout(900)` to `chrome.downloads.onChanged` listening for `state.complete`. The service worker can be terminated inside the 900 ms window on slow networks; the event-driven path fires exactly when the file exists and keeps the SW alive while downloads are in flight.
- **`diagnosticLog` off drops `_errors` immediately** (`ytkit.js`) — disabling the feature now calls `DiagnosticLog.clear()` in `destroy()` instead of waiting up to 5 minutes for the next `storageQuotaLRU` sweep.
- **Feature re-init failures surface to `diagnosticLog`** (`ytkit.js`) — settings-panel textarea re-init now routes `destroy()`/`init()` catches through `DebugManager.log()` instead of swallowing silently.

### Added — Infrastructure
- **`getSetting(key, default)`** (`ytkit.js`) — null-safe reader over `appState.settings`. Single choke point for settings access; replaces the scattered `appState.settings.X || default` pattern. Lays groundwork for gradual adoption across hot paths.
- **`selectorChain(selectors, { label, all, root, onMiss })`** (`ytkit.js`) — fallback-chain selector with first-miss diagnostics. Each miss is logged once per session per label, surfacing YouTube DOM drift to `diagnosticLog` instead of silent feature no-ops. Supports `all: true` for NodeList results.
- **`selectorChain` adopted at 3 high-churn regions** — macro-markers (chapter extract and chapter-jump features, with `ytd-macro-markers-list-renderer` + `[data-testid="chapter-item"]` fallbacks), player settings button (quality-forcing path, with `aria-label` and tooltip-target fallbacks).
- **Audit doc `HARDENING.md`** — checked-in audit covering real issues fixed in this release, false positives (already-mitigated claims documented so future audits skip them), YouTube platform drift watchlist, MV3 lifecycle notes, and recommended invariants.

### Changed
- **Empty `catch (_) {}` blocks** across `ytkit.js`, `background.js`, `popup.js` now either carry a `// reason:` comment explaining why silence is safe, or route through `DebugManager.log()` / `DiagnosticLog`. Pattern documentation for future audits; no behavioral change in the success path.
- **`_pendingReveals` set in `background.js`** — tracks downloads awaiting "show in folder" so the reveal survives service-worker restarts.

---

## [3.13.0] - Download Options Popup, Format/Quality/Directory Controls

### Added
- **Download options popup** — clicking the player download button now opens a popup with Video/Audio mode tabs, format chips (MP4/MKV/WebM for video; MP3/M4A/Opus/FLAC/WAV for audio), quality selector, and a custom save directory field.
- **Context menu expanded** — right-click player now shows "Download Video (MP4)", "Download Audio (MP3)", and "Download Options..." entries.
- **New settings** — `downloadVideoFormat` (default: mp4), `downloadAudioFormat` (default: mp3) with corresponding feature entries in the Downloads settings group.
- **Format passthrough** — download requests now send `format`, `quality`, and `outputDir` to the MediaDL server.
- **Server `/config` endpoint** — GET returns current download path and available formats/qualities; PUT updates the download directory.
- **Server format support** — video downloads now respect `format` parameter for merge output (mp4/mkv/webm). Audio downloads support mp3/m4a/opus/flac/wav with proper ffmpeg codec selection.
- **Server quality unlocked** — removed hardcoded 1080p cap; quality parameter (`best`/`2160`/`1440`/`1080`/`720`/`480`) now fully controls yt-dlp format selection.
- **Custom output directory** — per-download directory override with path validation and auto-creation.

### Fixed
- **Installer URLs** — MediaDLManager now points to `MediaDL` repo instead of deprecated `YouTube-Kit` installer.
- **GitHub link** — settings panel footer link updated to Astra-Deck repo.
- **Nyan cat GIF URL** — updated from YouTube-Kit to Astra-Deck.

---

## [3.12.0] - Options Page Redesign, Security Hardening, Rebrand Cleanup

### Changed — Options Page Redesign
- **Layout narrowed** from 1180px to 820px max-width for focused readability.
- **CSS variables simplified** — renamed `--panel-bg`/`--panel-border` to `--surface`/`--border`, added `--surface-raised`, `--accent-mid`, `--accent-border`.
- **Radii tightened** — `--radius-sm/md/lg` now 10/14/18px (was 16/22px).
- **Shadow simplified** to single `--shadow` token (was `--shadow-lg`/`--shadow-hover`).
- **Background gradient** simplified from 3-layer to single radial ellipse.
- **Toggle cards** use compact single-row layout (title left, toggle right) — no more "Enabled/Disabled" text labels.
- **Card structure refactored** — `.is-toggle` and `.is-complex` CSS classes for differentiated styling. Footer hidden until dirty/invalid for simple items.
- **Badges trimmed** — removed per-card key badge and type badge (type badge retained only for complex items). Group tag shown inline.
- **Description removed** from toggle and text/number cards — shown only for complex (list/json/textarea) items.
- **Hover lift effects removed** from stat cards (false affordance on read-only content).
- **HTML reduced** from ~1500 lines to ~1100 lines.

### Security
- **Quick Links URI scheme guard** — blocks `javascript:`, `data:`, and `vbscript:` URIs in user-configured quick link URLs.

### Housekeeping
- **Legacy branding removed** — deleted all old YTYT root-level images (banner.png, icon.png/ico/svg, favicon.ico, menu.png, icons/, images/).
- **Userscript URLs updated** — `@namespace`, `@updateURL`, `@downloadURL` now point to `Astra-Deck` repo (was `YouTube-Kit`).
- **manifest.json `homepage_url`** updated to Astra-Deck repo URL.
- **package.json** renamed to `astra-deck`, added `version` field, updated repository URL.
- **Build script** excludes `.claude-octopus` directories from staging.

---

## [3.11.1] - Deep Audit, Bugfixes, and Premium Polish

### Fixed

- **DiagnosticLog null safety.** `record()`, `get()`, and `clear()` now use optional chaining on `appState?.settings` to prevent crashes before settings initialization. `record()` catch block logs warnings instead of silently swallowing. `clear()` guards against missing `settingsManager`.
- **DeArrow fetch deduplication.** In-flight fetch dedup map (`_pending`) now declared in the feature object instead of lazy-initialized inside `_fetchBranding()`, preventing race conditions on first concurrent access.
- **CPU Tamer init ordering.** Native timer snapshot moved after WebGL prerequisite checks pass. Added `_patched` flag so `destroy()` only restores timers if they were actually patched, preventing stale restoration on early bail.
- **Video rotation validation.** `videoRotationAngle` now clamped to `[0, 90, 180, 270]` via allowlist, preventing arbitrary CSS from corrupted settings values.
- **Subtitle download guard.** Added `_downloading` flag to prevent parallel downloads from rapid double-clicks on the SRT button.
- **CI workflow.** Moved tag-vs-manifest version check before the build step to fail fast. Removed `2>/dev/null` on `gh release create` to surface real errors.

### Changed — Premium UI Polish

- **Popup header compressed** from 180px lockup to 70px compact header. Reclaims ~110px for toggle list.
- **Toggle on-state redesigned** with warm-gradient background and accent-tinted name text for instant visual scannability.
- **Toggle density tightened** — 4px gap (was 8px), 10px padding (was 12px), 1-line descriptions (was 2). Fits 2-3 more toggles in viewport.
- **Switch resized** from 42x24 to 38x22 for better proportion.
- **Footer buttons shortened** — "Open Settings On This Tab" → "Open Full Settings", "Open Options Page" → "Options".
- **Contextual notes simplified** from 30+ words to 5-8 words.
- **Options page copy tightened** across hero, action cards, stat subtexts, and notes panel.
- **CSS custom properties** added for radius tokens (`--radius-sm/md/lg`).
- **Padding grid standardized** to 8/10/12/16px increments.
- **Transitions snapped** from 220ms to 140-160ms for faster feel.
- **package.json** — added name, description, author, license, and repository fields.

---

## [3.11.0] - Hardening, Accessibility, and Cross-Surface Polish

### Fixed

- **Reddit Comments link hardening.** `d.permalink` from the Reddit JSON API is now validated through the `URL` constructor against a `reddit.com` allowlist before being used as `href`, and the row is promoted to `rel="noopener noreferrer"` to match every other external link.
- **Subtitle Download dead code removed.** Deleted an unused `_decode(s)` helper that set `textarea.innerHTML = s` — dead path that also tripped strict Trusted Types on YouTube pages.
- **Removed three `element.innerHTML = ''` resets** on freshly created `document.createElement` nodes (Reddit Comments, Watch-Time Analytics, AI Summary) — dead code and additional TT sinks.
- **Blocked-channel avatar surrogate pair.** The first-letter avatar initial now iterates by code point (`Array.from(str)[0]`) so emoji / CJK-only channel names no longer render a dangling half-surrogate glyph.
- **Download progress panel** — close button now synchronously clears the 1 s poll interval before removing the panel, so dismissing a download no longer wastes a full polling cycle on local HTTP hits.
- **File import guard.** In-page settings import now refuses files larger than 10 MB up-front and surfaces `FileReader` errors via toast instead of silently dropping them. Export object-URL revoke extended from 1 s → 60 s to match the options page exporter and avoid cancelled downloads on slower save-dialog paths.
- **Core storage retry integrity.** A failing `chrome.storage.local.set` retry used to merge pending writes into a regular object literal, replacing the `Object.create(null)` target with an `Object.prototype`-linked target. Retries now rebuild on a fresh prototype-less target.

### Added

- **Visual spinner on `aria-busy` buttons** (options page). Every long-running action (export, import, reset, save, open-settings) now shows a 12×12 spinner glyph next to its label while in flight.
- **Popup keyboard ergonomics.** Pressing Enter in the quick-toggle search now focuses the first visible toggle so it can be activated with Space. Pressing Escape clears the filter in one keystroke.
- **Forced-colors / Windows High Contrast support.** Both the popup and the options page restate borders, toggle surfaces, and focus indicators using system `CanvasText` / `Canvas` / `Highlight` keywords so every control stays distinguishable under forced-color themes.
- **Inline sliders glyph** on the popup empty state — a data-URI SVG layered over the accent gradient, no extra asset required.
- **Accessible reset button titles.** Each settings card's Reset button now explains its target value (`Reset AI Summary Model to gpt-4o-mini`) or the reason it's disabled (`No catalog default is available for this setting.`) via both `title` and `aria-label`.
- **Version chip tooltip** on the popup, showing the full `Astra Deck v3.11.0` string on hover.
- **7 new regression tests** guarding the bug-hardening fixes.

### Changed — cross-surface premium polish

- **Shared motion tokens** (`--ease-out`, `--ease-spring`, `--ytkit-ease-out`, `--ytkit-ease-spring`) introduced on the popup, options page, and in-page content-script CSS. Every interactive surface now breathes on the same curves.
- **Unified double-halo focus ring** across every interactive control on all three surfaces.
- **Toggle rows lift** on hover with a subtle `translateY(-1px)` + shadow on the popup; spring-eased thumb transitions on both popup and options toggles.
- **Action cards** on the options page elevate on hover; stat cards are now static (removed false-affordance hover lift since they are informational readouts).
- **Modal entrance animation.** The options settings modal fades + scales in (260ms) with a 220ms backdrop fade.
- **Scrollbar-gutter stability** on every scrollable region prevents horizontal jitter when scrollbars appear.
- **Download progress fill sheen.** A subtle 1.8s forward-moving highlight sweeps across active downloads. Auto-suppressed on success/error and under `prefers-reduced-motion`.
- **Status banner fade-ins** on the page-level and modal-level status banners.
- **Video-hider × button redesign.** Translucent bordered pill + 4px backdrop blur, enumerated transitions, visible `:focus-visible` for keyboard users.
- **Text overflow hardening** on popup toggle rows — names ellipsize, descriptions cap at two lines.
- **Options action-card grid** caps at 4 columns on ≥1240px viewports.
- **Settings workspace banner** now cross-fades between in-sync / unsaved / needs-attention / filtered states.
- **Microcopy** tightened across the options hero, action cards, and version card for more active phrasing.

---

## [3.10.0] - Watch Analytics, Subtitle Styling, AI Summary, Chapters

### Added

- **Watch History Analytics.** Modal dashboard plotting your last 30 days of YouTube watch time as a CSS bar chart. Stats row: 30-day total, daily average, active days, all-time. Entry via "📊 Watch Stats" button next to like/share on watch page, or `window.__ytkitOpenAnalytics()` from console. Uses the existing `watchTimeTracker` data store — enable both for it to populate.
- **Subtitle Styling.** Override YouTube caption appearance — font size (50–300%), font family (default / sans / serif / mono / YouTube Sans), color, background color + opacity, vertical offset, optional text shadow. Pure CSS override on `.ytp-caption-segment`, reacts live to setting changes.
- **AI Video Summary.** Bring-your-own-key LLM summarization button in player controls. Supports OpenAI-compatible, Anthropic (with `anthropic-dangerous-direct-browser-access: true`), Gemini, and Ollama (localhost). Fetches JSON3 transcript, truncates to 120k chars, renders response in a floating Catppuccin panel with Copy button. API key persists via `chrome.storage.local`. Fetch is direct from the content script (not through EXT_FETCH) so users can point to any endpoint without allowlist edits.
- **Copy Chapters as Markdown.** Player-button copies all chapters as a Markdown timestamped list with `youtu.be/<id>?t=<secs>` deep links. Falls back to parsing the description if no macro-markers are present.
- **Chapter Jump Buttons.** Prev / Next chapter buttons in the player right-controls, seeking to surrounding chapter start times.

### Changed

- `DiagnosticLog.record()` hooks for `aiVideoSummary` and `subtitleDownload` failures so errors show up in the diagnostic export.

---

## [3.9.0] - Visual Filters, Subtitle Download, Reddit Comments, Diagnostics

### Added

- **Subtitle Download (SRT).** One-click player-button download of the active caption track as SRT. Reuses the existing JSON3 caption fetch path, no sidebar required. Filename is `${videoId}_${languageCode}.srt`.
- **Video Visual Filters.** Floating panel with six CSS-filter sliders (brightness, contrast, saturation, hue, grayscale, sepia) applied live to `.html5-main-video`. Includes Reset button; filter persists across navigations. Catppuccin-mocha panel anchored to a new player-controls button.
- **DeArrow Peek Button.** Hold Alt to temporarily overlay original titles on top of DeArrow/custom rewrites. Lightweight CSS-only overlay — works with anything that sets `data-ytkit-orig-title` or `.ytkit-dearrow-rewritten`.
- **Video Age Color Coding.** Thumbnails on Home / Subscriptions / Search / sidebar get colored borders by upload age — green (fresh), blue (week), yellow (month), orange (year), red/dimmed (year+). Re-scans on mutations and SPA navigations.
- **Watch Page Tabs.** Description / Comments / Chapters / Transcript tabs injected above `#below` on watch pages. One view at a time, no scrolling between sections. Catppuccin pill-style tabs.
- **Reddit Comments.** Secondary-sidebar panel with "Load threads" button → fetches `reddit.com/search.json` for threads linking the current video. Shows top 15 with subreddit / score / comments. Origin added to `ALLOWED_FETCH_ORIGINS` (non-credentialed — no cookies sent).
- **Diagnostic Error Log.** Captures a rolling 500-entry ring buffer of YTKit errors (console + window.onerror + internal `DiagnosticLog.record`). `window.__ytkitDiagnostics.download()` emits a JSON bug report including version, user agent, URL, and entries.
- **Storage Quota LRU.** Periodic 5-minute sweep caps growing collections: `hiddenVideos` (5k), `hiddenChannels` (2k), `timestampBookmarks` (2k), `deArrowCache` (1k), `_errors` (500). Oldest entries pruned first; prevents `chrome.storage.local` quota exhaustion.
- **API Retry with Exponential Backoff.** `extensionFetchJson` now transparently retries 1s / 2s / 4s on 429 / 5xx / network errors. Default ON (`apiRetryBackoff: true`); feature flag exposed for disabling.

### Security

- `reddit.com` added to `ALLOWED_FETCH_ORIGINS` only (not `CREDENTIALED_FETCH_ORIGINS`) — no cookies ever forwarded to Reddit.

---

## [3.8.0] - Toolbar Popup, Digital Wellbeing, Settings Profiles, New Player Features

### Added

- **Toolbar popup with quick-toggles.** Clicking the toolbar icon now opens a Catppuccin-Mocha popup with 15 curated toggles (hide Shorts, hide related, SponsorBlock, DeArrow, comment search, no autoplay, cap scroll, persistent speed, blue-light, clean URLs, auto theater, transcript sidebar, mini player bar, digital wellbeing, debug mode), a live filter search, and buttons to open the full in-page panel or options page. Toggles broadcast via `YTKIT_SETTING_CHANGED` to the active YouTube tab for live init/destroy with no reload. Replaces the previous click-to-toggle-panel behavior; the full panel is one click deeper via the footer.
- **Settings Profiles (real implementation).** The previous stub is replaced with working save / load / delete / export / import JSON. State lives in `_profiles` and `_activeProfile`. Profile import merges on top of current defaults so missing keys pick up new-version defaults automatically. Exposed as `window.__ytkitProfiles` for panel / popup integration. Schema is versioned (`schemaVersion: 1`) for future migrations.
- **Digital Wellbeing.** Break reminders every N minutes of active playback + optional daily watch-time cap. Ticker runs only while the video is playing AND the tab is visible (no battery drain when idle). Persists `dwWatchTimeToday` keyed by local date — resets at midnight. Full-viewport overlay with Catppuccin card UI on break / cap; auto-pauses the video.
- **Video Rotation.** Rotate the active video 90° / 180° / 270° via CSS transform. 90/270° apply a 0.5625 scale to keep the rotated frame inside the player's 16:9 box. Useful for sideways phone-recorded videos.
- **Frame-by-Frame Buttons.** Visible ⏮ / ⏭ buttons inserted into the player's right-controls, stepping 1/30s at a time and auto-pausing the video. Surfaces YouTube's built-in `,` / `.` keyboard shortcuts for users who don't know they exist.

### Changed

- **Toolbar action behavior.** `default_popup` is now set in the manifest, so `chrome.action.onClicked` no longer fires — the popup handles it. `Ctrl+Shift+Y` still toggles the in-page panel directly.
- **`YTKIT_SETTING_CHANGED` message type.** Content script gains a new live-toggle path that re-inits / destroys the matching feature without a page reload.

---

## [3.7.0] - Transcript Export, Privacy Hardening, Tracking-Param Strip

### Added

- **Transcript export.** The `transcriptViewer` sidebar now has four export buttons under the header: **Copy** (plain-text to clipboard), **.txt** (download), **.srt** (download SubRip subtitles with `HH:MM:SS,mmm` timestamps), and **LLM** (copies a ready-to-paste summarization prompt with title, URL, and timestamped transcript). All exports use the already-fetched JSON3 caption data — no extra network requests. SRT cue end-times derive from `dDurationMs` when available, falling back to the next cue's start.
- **Expanded URL tracking-param strip.** `cleanShareUrls` now strips UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`) and click-tracking IDs (`gclid`, `fbclid`, `mc_cid`, `mc_eid`, `igshid`, `twclid`, `yclid`) in addition to the existing YouTube-internal params. Applies on copy, share-panel display, and address-bar replaceState.

### Security

- **Cookie isolation on EXT_FETCH proxy.** `background.js` previously sent `credentials: 'include'` on every proxied fetch, leaking YouTube session cookies to third-party APIs (SponsorBlock, Return YouTube Dislike, DeArrow). The proxy now defaults to `credentials: 'omit'` and only includes credentials for the explicit allowlist of YouTube-family origins and the local MediaDL endpoint. No behavior change for SponsorBlock/RYD/DeArrow — those endpoints don't require auth.

---

## [3.6.7] - Theater Split Overhaul + SponsorBlock Cleanup

### Fixed

- **Seek stutter on quality lock.** `autoMaxResolution` triggered quality DOM-click cascade on every `canplay`/`playing` media event, including seeks. Added `_qualityLocked` flag that short-circuits the handler once quality is set for the current video. Eliminates 3x stutter on every forward/backward seek.
- **Settings panel listener leak.** `_panelUIListenersAttached` was never reset when the panel closed, causing duplicate document-level listeners on every open/close cycle. Now reset in the panel-close MutationObserver callback.
- **SponsorBlock skip toasts removed.** Skip notifications (`showToast`) overlaid the video during playback. Removed entirely — segments still auto-skip silently. Deleted the dead `sbShowSkipNotice` setting and sub-feature definition.
- **Theater Split close button invisible.** CSS set `display:none` but expand code only set `opacity:0.3` without switching to `display:flex`. Close button now properly shows/hides on expand/collapse.
- **Theater Split dismiss not honored.** The `dismissed` parameter in `_collapseSplit()` was accepted but never used. Closing via the X button or Escape would not prevent scroll-down from immediately re-expanding. Now sets `_dismissed = true` which blocks `_expandSplit()` until the next video navigation.
- **Theater Split scroll-up collapse too sensitive.** A single scroll-up tick at `scrollTop=0` instantly collapsed the right panel. Now requires 3 consecutive scroll-up ticks within 600ms to trigger collapse.
- **Theater Split fullscreen conflict.** Native fullscreen (F key) with the overlay active caused the z-index:9999 overlay to block player controls. Added `fullscreenchange` listener that hides the overlay and restores natural player sizing during fullscreen, then re-mounts on exit.
- **Theater Split destroy leak.** `_lastVideoId` was not reset in `destroy()`, so disabling and re-enabling the feature on the same video could leave `_dismissed` stuck as `true`.

### Improved

- **SponsorBlock scheduled skipping.** Replaced 500ms `setInterval` polling with scheduled `setTimeout` that computes delay to the next segment boundary. Event-driven reschedule on `playing`/`seeked`/`ratechange`, clears on `pause`.
- **SponsorBlock hash-prefix privacy.** Full video ID was sent to the SponsorBlock API. Now uses SHA-256 hash-prefix lookup (`/api/skipSegments/{first4chars}`) with client-side filtering.
- **A/B Loop event-driven.** Replaced 100ms `setInterval` with `timeupdate` event listener on the video element.
- **Auto-skip chapters event-driven.** Replaced 1s `setInterval` with `timeupdate` event via document capture phase.
- **MiniPlayerBar IntersectionObserver.** Replaced scroll event polling with `IntersectionObserver` on the player element (threshold 0.1).
- **Codec filtering: MediaCapabilities.decodingInfo.** YouTube bypassed `canPlayType`/`isTypeSupported` overrides via `MediaCapabilities.decodingInfo`. Added third API override in `ytkit-main.js`.
- **Theater Split divider touch drag.** Added `touchstart`/`touchmove`/`touchend` handlers using shared drag logic. Works on tablets/touchscreens.
- **Theater Split double-click divider reset.** Double-clicking the divider resets the split ratio to the default 75/25. Extracted `_applyDividerRatio()` shared helper.
- **Theater Split escape key.** Pressing Escape collapses the split panel (with input/textarea/contentEditable guard).
- **Theater Split mount animation.** Overlay fades in over 300ms instead of snapping into place.
- **Theater Split divider grip pattern.** Replaced plain rectangle pip with three-dot vertical grip (universal drag indicator). Always partially visible (opacity 0.4), full opacity on hover.
- **Theater Split collapse strip.** Increased height from 24px to 32px, indicator bar always visible with subtle gradient at rest, thicker handle on hover.
- **Settings panel click delegation.** Consolidated 4 separate `document.addEventListener('click', ...)` into 1 delegated handler.
- **Custom CSS injection event-driven.** Replaced 2s `setInterval` polling with `ytkit-settings-changed` event listener.
- **Hex color regex fix.** `themeAccentColor` regex accepted invalid lengths like 5 or 7. Now validates exact lengths (3, 4, 6, or 8 hex chars).
- **Background fetch timeout floor.** Added 1s minimum to prevent near-zero timeouts from aborting fetches.
- **Navigate rule cleanup.** Debounce timer cleared when the last navigate rule is removed.
- **Storage change listener resilience.** Wrapped `chrome.storage.onChanged` in try-catch.
- **Cinema ambient glow hidden-tab cleanup.** Removed pointless RAF wrapper around setTimeout when tab is hidden, added `_hiddenTimer` cleanup.
- **Download poll panel disconnect.** Added `if (!panel.isConnected)` guard to clear orphaned download progress intervals.
- **Auto-dismiss "Still Watching" popup.** Added `yt-popup-opened` event listener for faster detection.
- **Video screenshot improved.** Filename includes video title, `URL.revokeObjectURL` delayed to 5 seconds.

### Dead code removed

- Unused `_headerH()` method and dead `const hh` variable in `_buildOverlay()`
- No-op `_initDividerDrag(divider, left, null)` call (null guard returned immediately)
- `sbShowSkipNotice` default setting and sub-feature definition

---

## [3.6.5] - Settings Panel Handler Performance

### Fixed

- **Settings panel event listeners ran on every YouTube interaction.** `attachUIEventListeners()` registers seven document-level event listeners (four `click`, two `input`, one `change`) that power the in-page settings panel — search box, feature toggles, nav tabs, export/import buttons, textareas, selects, ranges, color pickers. These listeners are registered once per session (guarded by `_panelUIListenersAttached`) and then fire on **every** click / input / change anywhere on the page for the rest of the session, not just while the panel is open. Each handler did `e.target.matches(...)` or `closest(...)` on a panel-scoped selector and silently fell through when the target wasn't in the panel. On a session full of YouTube comment typing, thumbnail clicks, and scroll/click interactions, that's hundreds of wasted DOM walks per minute. Each handler now short-circuits with `if (!isSettingsPanelOpen()) return;` as its first line — the selectors it's looking for only exist inside the panel DOM, so guarding on panel-open state is semantically equivalent but cuts the work to zero when the panel is closed (which is 99% of the time).

### Notes

Fifth audit pass. Focused on the `buildSettingsPanel` / `attachUIEventListeners` surface which hadn't been inspected in earlier passes. Purely a performance fix — no user-visible behavior change.

---

## [3.6.4] - Theater Split Audit Pass

### Fixed

- **Theater Split: wheel-gesture collision with YouTube volume.** The document-level `wheel` handler in `stickyVideo` was registered with `{ passive: true, capture: true }` but never called `stopPropagation()` on events it acted on, so YouTube's own wheel-to-volume listener on `#movie_player` fired on the same event. Scrolling over the player to expand the split, or scrolling the split-open right panel past the top to collapse, was also adjusting the video volume at the same time. `passive: true` only prevents `preventDefault()` — `stopPropagation()` is still legal and is now called in each action branch. Same treatment applied to the matching touchmove handler.
- **Theater Split: `_entering` flag leak on early collapse.** `_expandSplit` sets `_entering = true` and arms a 500 ms fallback timer that calls `onExpanded()` if `_entering` is still true. `_collapseSplit` did not reset the flag, so collapsing the split before the expand transition finished left the fallback timer to fire on an already-collapsed panel, re-running `_triggerPlayerResize()` and `checkAllButtons()` on stale state. `_collapseSplit` now clears `_entering`.
- **Theater Split: divider drag orphans on alt-tab.** The divider drag listener attaches `mousemove` / `mouseup` to `window` plus a full-viewport `dragShield` overlay. If the user alt-tabs mid-drag or the pointer leaves the document before releasing the mouse, `mouseup` may never deliver, leaving the shield covering the page and both listeners attached until the next drag replaces them. `onUp` is now also fired on `window.blur` and `document.mouseleave` so the drag cannot orphan.

### Notes

Fourth and final defensive-hardening pass. The wheel/volume collision is the highest-impact user-visible fix in this series — it's a direct UX regression that anyone using Theater Split with a mouse wheel would feel every time they expanded or collapsed the split.

---

## [3.6.3] - Third QA Audit Pass

### Fixed

- **Pop-Out Player — Document PiP window leak + duplicate listeners.** Two separate `pagehide` listeners were attached to the PiP window (one to restore the video, one to clear the `__ytkit_videoPopped` flag), and the internal `_timeInterval` that polled `currentTime` every 500 ms for the time display was only cleared in `destroy()` — not when the PiP window itself closed. Closing the PiP window therefore left the interval running forever, continuing to read `currentTime` from the reparented video and write to a detached DOM node. The three cleanup steps are now merged into a single `pagehide` handler that stops the interval, reparents the video, clears the flag, and nulls the window reference
- **Watch Time Tracker — 90-day retention off-by-one.** The pruning loop used `if (dk < cutoffKey) delete stats.days[dk]`, which kept the day exactly 90 days ago in addition to the 90 days since, resulting in 91 days of history instead of the labeled 90. Changed to `<=` so the retention window matches the label exactly

### Notes

Third consecutive defensive-hardening pass. Every finding in this release was verified in-situ (not just pattern-matched) — several audit-agent claims were rejected as false positives during verification (e.g. `removeEventListener({capture:true})` vs `true` being "mismatched"; `pauseOtherTabs` BroadcastChannel leak; `contextMenuPlayer` player-element tracking).

---

## [3.6.2] - Second QA Audit Pass

### Fixed

- **Cinema Ambient Glow background-tab CPU waste** — the canvas sampling loop ran at full rate while the tab was hidden even though the glow was invisible. Now short-circuits when `document.hidden` is true and falls back to a 2 s poll until the tab is visible again
- **Video Screenshot cross-origin silent failure** — `ctx.drawImage(video, ...)` on a tainted frame was throwing a `SecurityError` that the caller swallowed, leaving the user with no feedback. `drawImage` and `toBlob` are now wrapped in targeted try/catch blocks that surface a clear "Screenshot blocked: cross-origin video frame" toast
- **CPU Tamer pump interval leak + destroy clarity** — the internal rAF pump `origSetInterval(..., 125)` was orphaned (no handle captured), so disabling the feature left the pump firing forever. The handle is now stored on `_pumpInterval` and destroy clears it using the *preserved native* `clearInterval` so teardown is robust even while the wrappers are still in place. Init also captures the originals before flipping the global flag so a failed setup does not desync restore state
- **Options page: redundant toggle change listeners** — `renderToggleControl` was attaching two separate `change` handlers per toggle input (one for draft state, one for label text). Merged into a single handler; halves the per-click work without changing behavior

### Build system

- **`--bump` argument validation** — running `node build-extension.js --bump` with no type (or with a bogus type) previously silently no-op'd the bump because the falsy check skipped the whole block. Now fails loudly with a usage error and non-zero exit
- **YTKIT_VERSION regex hard-fail** — if the `const YTKIT_VERSION = '...'` line in `ytkit.js` ever stops matching the replacement regex (e.g. refactored to template literal), the build now aborts with an explicit error instead of silently shipping a stale embedded version
- **Userscript version sync** — `ytkit.user.js` is now kept in sync with the extension version on every `--bump`, regardless of the `--with-userscript` flag. The flag still controls whether a `build/` artifact copy is emitted. Fixes the drift where the repo-tracked userscript was stuck at 3.2.0 while the extension was at 3.6.x
- **Build cleanup on failure** — the build function now wraps Chrome + Firefox staging in a `try/finally` so orphan `chrome-stage/` and `firefox-stage/` directories can't survive a mid-flight crash
- **Skip `node_modules/` during staging** — an accidental `node_modules/` under `extension/` would previously get copied into the ZIP. Now unconditionally excluded
- **Deleted dead `build.js`** — it targeted a `YTKit.user.js` file that no longer exists (renamed to lowercase) and produced a `YTKit.min.user.js` that nothing consumed. Confirmed disconnected from the pipeline before removal

### Notes

No user-visible feature changes. This is a second defensive-hardening pass following 3.6.1.

---

## [3.6.1] - QA Audit Hardening

### Fixed

- **Innertube client version parsing (ISOLATED world)** — `_getClientVersion()` previously read `window.ytcfg`, which is invisible to content scripts running in the ISOLATED world, so the value was always `null` and the Innertube API fallback used a hardcoded stale version. It now parses `INNERTUBE_CLIENT_VERSION` out of page `<script>` tags (same pattern as `_getInnertubeApiKey()`), with a recent default. This fixes silent failures of the caption-extraction Method 2 path weeks after each YouTube client rotation
- **`ytInitialPlayerResponse` brace-counting parser** — the fallback JSON extractor tracked `{` / `}` depth without respecting string literals, so any JSON value containing `}` inside a string (e.g. comment text, video titles, descriptions) caused the extracted substring to be truncated early and `JSON.parse()` to throw. Parser now properly tracks string state and `\` escapes
- **TrustedHTML fallback innerHTML sink** — the non-policy branch of `TrustedHTML.setHTML()` did `element.innerHTML = ''` to clear before appending parsed nodes; replaced with `element.replaceChildren()` so no innerHTML assignment happens on the fallback path
- **Settings panel modal Escape handler** — guarded the `keydown` listener installation with `injectPageModalButton._escInstalled` so future refactors that call the injector twice cannot stack duplicate listeners
- **`setInterval` double-init guards** — `resumePlayback._saveInterval`, `watchProgress._saveInterval`, and `SponsorBlock._skipHandler` now clear any existing interval before creating a new one. Fixes a stacking leak when `init()` runs twice before `destroy()` (rapid disable/enable toggles or async load overlap)
- **`background.js` message guard** — the top-level `onMessage` listener now rejects malformed payloads (`!msg || typeof msg !== 'object' || typeof msg.type !== 'string'`) before reading `msg.type`, eliminating a potential uncaught throw on corrupt messages
- **`EXT_FETCH` default timeout** — callers that omit `timeout` previously got an unbounded fetch; the proxy now defaults to a 30 s timeout (still clamped to `MAX_FETCH_TIMEOUT_MS`) so a hung upstream cannot pin the service worker
- **`EXT_FETCH` body size enforcement** — the response reader now streams chunks through a bounded loop and aborts as soon as the cumulative byte count exceeds `MAX_RESPONSE_BYTES`, so a chunked response without a `Content-Length` header cannot allocate past the limit before the size check runs

### Notes

No user-visible feature changes. All fixes are defensive hardening driven by a dedicated QA audit pass across `ytkit.js`, `background.js`, and the runtime cores.

---

## [3.6.0] - Runtime Modularization & Hardening

### Changed

- **Modular runtime architecture** — extracted shared helpers from the monolithic `ytkit.js` into seven dedicated `extension/core/*.js` modules: `env.js`, `storage.js`, `styles.js`, `url.js`, `page.js`, `navigation.js`, `player.js`. Modules are loaded in the ISOLATED world before `ytkit.js` via `manifest.json` `content_scripts`, cutting `ytkit.js` by roughly 3,100 lines and isolating state from feature code
- **Hardened settings flow** — `options.js` now consumes the generated `default-settings.json` + `settings-meta.json` catalogs instead of re-implementing defaults inline; settings reads/writes go through `StorageManager` with consistent fallback/migration paths
- **Hardened runtime paths** — player lookup, URL parsing, and navigation helpers now live behind a single source of truth (`core/player.js`, `core/url.js`, `core/navigation.js`); removed duplicated ad-hoc implementations in `ytkit.js`
- **Background script hardening** — tightened `background.js` permission checks and message routing alongside the runtime extraction
- **Build pipeline** — `build-extension.js` now emits `extension/default-settings.json` + `extension/settings-meta.json` on every build by brace-balanced parsing of the `defaults:` block and the `SETTINGS_VERSION` constant in `ytkit.js`, so the runtime catalog cannot drift from source

### Notes

No user-facing features added or removed. This release is a behind-the-scenes refactor to make future feature work faster and reduce regressions from shared-state bugs.

---

## [3.2.0] - 115+ Features Mega Update

### Added

- **115+ new features** across 8 feature waves, all off by default
- **Firefox extension support** — build system produces `.xpi` with auto-patched manifest (Gecko `browser_specific_settings`, `background.scripts` array)
- **SharedAudio manager** — volumeBoost, skipSilence, audioNormalization, audioEqualizer share one MediaElementSource via `SharedAudio.register()`/`unregister()`, preventing Web Audio API conflicts
- **StorageManager** — unified persistent storage for resumePlayback (500-entry cap), per-channel speed, timestamp bookmarks, watch time tracking
- **CONFLICT_MAP** — automatic mutual-exclusion for conflicting features (persistentSpeed vs perChannelSpeed, removeAllShorts vs redirectShorts, etc.)

#### Wave 1 — Quick Wins
autoDismissStillWatching, remainingTimeDisplay, showPlaylistDuration, showTimeInTabTitle, customProgressBarColor, reversePlaylist, rssFeedLink, preciseViewCounts, videoScreenshot, compactUnfixedHeader, returnYoutubeDislike, volumeBoost, perChannelSpeed, hideWatchedVideos, antiTranslate, pauseOtherTabs

#### Wave 2 — Complex & Differentiating
skipSilence, abLoop, fineSpeedControl, showChannelVideoCount, redirectHomeToSubs, notInterestedButton, timestampBookmarks, blueLightFilter, disableInfiniteScroll, audioNormalization, popOutPlayer (Document PiP API + fallback)

#### Wave 3 — Audio & Automation
audioEqualizer (10-band EQ, 9 presets), watchTimeTracker, alwaysShowProgressBar, sortCommentsNewest, autoSkipChapters, chapterNavButtons, videoLoopButton, persistentSpeed, codecSelector (H.264/VP9/AV1), ageRestrictionBypass, autoLikeSubscribed, thumbnailPreviewSize

#### Wave 4 — Polish & Deep Enhancement
cinemaAmbientGlow, transcriptViewer, searchFilterDefaults, forceStandardFps, stickyChat, autoExpandDescription, scrollToPlayer, hideEndCards, hideInfoCards, keyMoments

#### Wave 5 — Power User & QoL
autoTheaterMode, resumePlayback, miniPlayerBar, playbackStatsOverlay, hideNotificationBadge, autoPauseOnSwitch, creatorCommentHighlight, copyVideoTitle, channelAgeDisplay, speedIndicatorOverlay, hideAutoplayToggle, fullscreenOnDoubleClick

#### Wave 6 — Interaction & Media Control
volumeScrollWheel, rememberVolume, pipButton, autoSubtitles, focusedMode, thumbnailQualityUpgrade, watchLaterQuickAdd, playlistEnhancer, commentSearch, videoZoom, forceDarkEverywhere

#### Wave 7 — Customization & Utilities
customCssInjection, shareMenuCleaner, autoClosePopups, videoResolutionBadge, likeViewRatio, downloadThumbnail, grayscaleThumbnails, disableAutoplayNext, channelSubCount, customSpeedButtons, openInNewTab, muteAdAudio

#### Wave 8 — Restored Archive Features
**SponsorBlock per-category controls:** sbCat_sponsor, sbCat_selfpromo, sbCat_interaction, sbCat_intro, sbCat_outro, sbCat_preview, sbCat_filler, sbCat_music_offtopic
**Playback & navigation:** preventAutoplay, scrollWheelSpeed (Shift+scroll, yields to volumeScrollWheel/videoZoom), playbackSpeedOSD, persistentSpeed step config (speedStep)
**Comments & interaction:** preloadComments, commentNavigator (J/K navigation), enableHandleRevealer (resolves @handles in comments)
**Chapters & transcript:** autoOpenChapters, autoOpenTranscript
**Notifications:** chronologicalNotifications (sorts newest-first)
**Live streams:** adaptiveLiveLayout (dynamic chat/video sizing)
**Shorts:** shortsAsRegularVideo (redirects /shorts/ to /watch)
**Theme & styling:** themeAccentColor (custom accent color picker), nyanCatProgressBar (rainbow animated progress bar), noFrostedGlass (removes backdrop-filter blur)
**Player behavior:** theaterAutoScroll (scroll to player on theater mode), enableCPU_Tamer (requestAnimationFrame timer throttling)
**Downloads & external players:** showVlcQueueButton, showMpvButton, showDownloadPlayButton, autoDownloadOnVisit, downloadQuality selector, preferredMediaPlayer selector, subsVlcPlaylist (export subscriptions feed to VLC)
**Advanced:** enableEmbedPlayer (custom HTML5 embed player), deArrow (DeArrow API — clickbait title/thumbnail replacement with 6 sub-settings), showStatisticsDashboard (detailed extension stats panel), settingsProfiles (save/load settings presets), debugMode (verbose console logging)
**CSS-only:** hideNotificationButton, hideLatestPosts, disableMiniPlayer

#### Wave 9 — Final Archive Restoration
squareSearchBar (square search bar corners), squareAvatars (square channel avatars), fitPlayerToWindow (player fills entire browser viewport), disableSpaNavigation (force full page loads instead of SPA transitions)

### Fixed

- **Feature conflicts resolved through code cooperation** rather than mutual exclusion:
  - forceH264 + codecSelector share a single canPlayType patch reading settings at call-time
  - focusedMode hides only related videos, not `#secondary` — cooperates with transcriptViewer, timestampBookmarks, stickyVideo
  - popOutPlayer sets `__ytkit_videoPopped` flag — pipButton and fullscreenOnDoubleClick check before acting
  - autoPauseOnSwitch + pauseOtherTabs tag pause reasons on the video element to avoid resume conflicts
  - volumeScrollWheel yields Ctrl+scroll to videoZoom via ctrlKey guard
  - hideEndCards merged into hideVideoEndContent as sub-feature (eliminates CSS overlap)
  - hideInfoCards corrected to target info card selectors, not end card selectors

### Changed

- **Build system** — `node build-extension.js` now outputs Chrome ZIP+CRX3 and Firefox ZIP+XPI
- **Settings panel** — feature groups reorganized for 79+ features with search
- **Userscript** synced to extension source with native GM_* APIs

---

## [2.8.0] - Maintenance & Ad Blocker Tuning

### Changed

- **Ad blocker cosmetic filters updated** — Refreshed CSS selector list to cover YouTube's current ad container patterns, including updated masthead, player overlay, and feed ad slot selectors
- **PRUNE_KEYS updated** — Added newer ad payload keys seen in current YouTube API responses (`auxiliaryUi`, `adBreakServiceRenderer`, `watchNextAdsRenderer`)
- **SponsorBlock category list** — Updated to include `selfpromo` and `preview` categories introduced in recent SponsorBlock API versions
- **Theater Split** — Improved detection of YouTube's responsive layout breakpoints to prevent Theater Split from activating on narrower viewports where it degrades layout

### Fixed

- **VLC/yt-dlp buttons not appearing on initial load** — Added retry loop for button injection when YouTube's player controls render late during SPA navigation
- **Video Hider keyword filter false positives** — Regex compilation no longer throws unhandled exceptions on invalid patterns; invalid regexes are silently skipped with a console warning

---

## [2.7.5] - Feature Cleanup

### Removed

- **Playback category** — Removed entire Playback settings group and all 5 features:
  - Mousewheel Speed Control (Shift+scroll speed adjust)
  - Video Screenshot (S key frame capture)
  - Return YouTube Dislike (API-based dislike counts)
  - Cinema Mode (dim overlay with C key)
  - A-B Loop (bracket-key loop points)
- **Fit to Window** — Removed redundant player sizing feature (Theater Split handles this)
- **RYD API connection** — Removed `@connect returnyoutubedislikeapi.com` from userscript header
- **Conflict rules** — Removed fitPlayerToWindow vs stickyVideo conflict entries

### Changed

- **Expand Video Width** — Simplified CSS selector (no longer excludes removed fit-to-window class)

---

## [2.7.4] - Userscript Research & Hardening

### Changed

- **Shorts redirect** — Switched from `location.href` to `location.replace()` so redirected Shorts don't create back-button history entries (pattern from popular redirect scripts)
- **SPA navigation** — Added `yt-page-data-updated` as backup event alongside `yt-navigate-finish`, catching edge cases where navigation finish fires before DOM is ready (pattern from YouTube Alchemy)
- **Return YouTube Dislike formatting** — Replaced manual K/M/B formatter with `Intl.NumberFormat` compact notation for locale-aware dislike counts (e.g. "1,2K" in French, "1.2K" in English)
- **Return YouTube Dislike button detection** — Replaced single CSS selector with multi-layout fallback chain (6 selectors) that handles YouTube's segmented button, toggle button, and menu container layouts (pattern from official RYD script)

### Fixed

- **v2.7.2** — Added Disable Seek Preview as CSS-only feature
- **v2.7.3** — Upgraded Disable Seek Preview to full JS+CSS feature with MutationObserver tooltip detection and mousemove gesture blocking (CSS-only approach was insufficient)

---

## [2.7.1] - Debloat & Build Pipeline

### Changed

- **Color theme compression** — Replaced 21-property theme objects with comma-separated hex strings + `_getTheme()` decompressor, cutting theme data by ~60%
- **Theater Split deduplication** — Extracted `_setStyles`, `_removeStyles`, `_setupChat` helpers; simplified live/VOD/standard branching (~43 lines saved)
- **Settings sidebar deduplication** — Extracted `makeNavBtn` and `addDragReorder` helpers for sidebar button creation (~65 lines saved)

### Added

- **build.js** — Node.js build script that strips comments and collapses whitespace for production builds (25% size reduction: 607KB -> 455KB)

---

## [2.7.0] - Progress Bar & Seek Fix

### Fixed

- **Seek bar completely broken** — Removed all CSS dimension overrides (height, margin-top, width) on YouTube's progress bar container, progress bar, and progress list that were breaking YouTube's internal seek coordinate calculations
- **SponsorBlock blocking manual seeks** — Skip loop running at 60fps was fighting with user scrubbing, immediately bouncing playback out of sponsor segments during drag. Added mousedown/mouseup detection on progress bar to pause skip loop while scrubbing, plus 800ms grace period after release
- **Video going black on window un-maximize** — Added resize event listener to Theater Split overlay that forces video GPU re-composite via will-change toggle when window geometry changes
- **Theater Split fighting with player controls** — Removed CSS overrides that forced width/left on .ytp-chrome-bottom and .ytp-progress-bar-container, and removed forcePlayerSize code that kept stripping/re-setting those values

### Changed

- **Nyan Cat theme scrubber** — Kept cat.gif on scrubber handle but removed all dimension overrides (width, height, margins) that broke seek hit detection
- **Removed starfall scrubber pull indicator** — Decorative overlay that contributed to progress bar dimension misalignment
- **Settings panel padding** — Added small breathing room (4px) to sidebar, nav buttons, feature cards, pane headers, footer, and search container so elements don't ride on borders

---

## [2.6.9] - Ultra-Condensed Settings Panel

### Changed

- **Zero-padding layout** — Header, sidebar, nav buttons, feature cards, pane headers, and footer all use zero vertical padding for maximum density
- **Responsive breakpoints updated** — All three breakpoints (900px, 700px, 480px) adjusted to match condensed dimensions

### Removed

- **Logo icon** — Removed the red YouTube logo from the settings header
- **Pane icons** — Removed category icon badges from all pane headers (regular, Ad Blocker, Video Hider)
- **Status badges** — Removed Active/Off/Enabled/Crashed state badges from feature cards
- **Recently changed section** — Removed the recently changed pills, tracking function, and event dispatch

---

## [2.6.7] - Disable Autoplay Next

### Added
- **Disable Autoplay Next** — New feature (enabled by default) that prevents YouTube from automatically playing the next suggested video when the current one ends. Turns off YouTube's native autoplay toggle and cancels pending navigation on video end

---

## [2.6.6] - Comment Enhancements Cleanup

### Removed
- **Collapse replies button** — Removed the per-thread collapse/show replies toggle entirely
- **Cold/warm heat indicators** — Heat indicators now only appear on comments with 1K+ likes (hot/fire tiers); removed the low-value cold (<100) and warm (100-999) tiers

---

## [2.6.5] - Survey Spam Blocked

### Added
- **Survey cosmetic hiding** — Block `ytd-inline-survey-renderer` and `ytd-single-option-survey-renderer` spam popups via the ad blocker cosmetic selector list

---

## [2.6.4] - Seek Preview Fix

### Fixed
- **Playback bar hidden** — The Disable Seek Preview CSS was too broad, hiding the entire time tooltip and chapter markers. Narrowed selectors to only target the storyboard frame preview image while preserving the normal progress bar UI

---

## [2.6.3] - Bug Audit & Stability Fixes

### Fixed
- **StorageManager data loss** — `_flush()` no longer clears the dirty set before confirming each save succeeded; failed keys are retried on next flush
- **Settings load race condition** — `settingsManager.load()` no longer reads storage twice for version comparison; uses the value from the initial read
- **Settings panel null crash** — Added null guards on all `.closest('[data-feature-id]')` calls in event handlers (feature toggle, select, range, color, textarea) to prevent crash if DOM structure is unexpected
- **Feature init dependency ordering** — `topoSort` now resolves `dependsOn` dependencies in addition to `parentId`, ensuring dependent features always initialize after their prerequisites
- **Clipboard silent failures** — All `navigator.clipboard.writeText()` calls now have `.catch()` handlers that show error toast feedback instead of failing silently
- **Ad blocker circular reference guard** — `deepPruneAds()` now uses a WeakSet to skip already-visited objects, preventing potential stack overflow on circular JSON references in YouTube API responses

---

## [2.6.2] - Black Video Fix

### Fixed
- **Conflict enforcement at init time** — Features in CONFLICT_MAP (e.g., Fit Player to Window vs Theater Split) are now checked during initialization, not just when toggling in settings. Previously, both could initialize simultaneously and fight over the player layout, causing a black video with only audio
- **Default settings** — Changed `fitPlayerToWindow` default to `false` since Theater Split (stickyVideo) is the preferred default and initializes as a critical feature

---

## [2.6.1] - Seek Preview Fix

### Added
- **Disable Seek Preview** — New feature (enabled by default) that hides the large video frame preview overlay on the progress bar, fixing issues where the preview blocks click-to-seek

---

## [2.6.0] - Unified Theme System

### Changed
- **Theme-aware accents** — Watch Page Restyle, Refined Comments, Comment Enhancements, and reply box styling now follow the selected Color Theme instead of using hardcoded purple
- **CSS custom properties** — Introduced `--ytkit-accent`, `--ytkit-accent-rgb`, and `--ytkit-accent-light` variables that all visual features share; defaults to purple when no theme is selected
- **Cosmic comments** — The accent-tinted comment section background (previously Nyan Cat-exclusive) is now part of Refined Comments and adapts to any Color Theme
- **Nyan Cat theme** — Updated to use the shared accent variable system; cosmic comments background now derives from accent color

### How it works
Selecting a Color Theme (e.g., Gruvbox, Nord, Tokyo Night) now automatically tints the Watch Page Restyle buttons/borders, Refined Comments thread lines/author names, and the comment section background to match the theme's accent color. No extra configuration needed.

---

## [2.5.0] - Quality & Infrastructure

### Removed
- **Mousewheel Volume Control** — Removed entirely; intercepting scroll events on the player prevented normal page scrolling to reach comments

### Changed
- **Conflict enforcement** — CONFLICT_MAP now auto-disables conflicting features when you enable one (instead of just showing a warning toast)
- **Settings search debounce** — Search input is now debounced (150ms) for smoother filtering on large feature lists
- **API key caching** — `_getInnertubeApiKey` result is cached to avoid repeated script tag scanning
- **Navigation listener guard** — `yt-navigate-finish` listener is now guarded against duplicate registration

### Added
- `.github/ISSUE_TEMPLATE/bug_report.md` — Structured bug report template
- `.github/ISSUE_TEMPLATE/feature_request.md` — Feature request template
- `.github/pull_request_template.md` — PR template with testing checklist
- `CONTRIBUTING.md` — Contributor guide with architecture overview and code style guidelines

---

## [2.4.0] - Competitive Feature Parity

New features inspired by research across Enhancer for YouTube, ImprovedTube, Return YouTube Dislike, Unhook, BlockTube, YouTube NonStop, Nova YouTube, and DeArrow:

- **Mousewheel Speed Control** (Playback) - Hold Shift + scroll on video to adjust playback speed (0.25x - 4x) with overlay indicator
- **Mousewheel Volume Control** (Playback) - Scroll on video to adjust volume in 5% increments with overlay indicator
- **Video Screenshot** (Playback) - Press S while watching to capture current frame as PNG (copies to clipboard + downloads)
- **Return YouTube Dislike** (Playback) - Shows dislike counts and like/dislike ratio bar using the RYD API
- **Cinema Mode** (Playback) - Press C to dim everything except the video player; press again to toggle off
- **A-B Loop** (Playback) - Press [ for loop start, ] for loop end, \ to toggle. Visual markers on progress bar.
- **Force H.264 Codec** (Quality) - Prefer H.264 over VP9/AV1 for lower CPU usage on older hardware
- **Normalize Clickbait Titles** (Content) - Converts ALL CAPS titles to Title Case while preserving acronyms
- **Watch Progress Indicators** (Content) - Shows colored progress bars on thumbnails based on locally-saved watch history
- Enhanced "Still Watching?" prevention with proactive activity simulation
- New "Playback" settings category for player interaction features

## [2.3.0] - Robustness & Polish

- Protocol handler error handling: try/catch with informative toast for ytdl://, ytvlc://, ytmpv://, ytvlcq:// failures
- SponsorBlock hash prefix fallback: retries with 6-char prefix on 404 (improves segment detection)
- Updated ad blocker PRUNE_KEYS with 2025+ YouTube ad payload keys
- Updated AD_RENDERER_KEYS_ARR with newer ad renderer types
- Cobalt instance health check: HEAD request on init, auto-switches to fallback if unreachable
- Established z-index hierarchy constants (Z.TOAST, Z.CONTEXT_MENU, Z.SETTINGS_PANEL, etc.) to prevent layer collisions
- Settings import rollback protection: validates import data and restores backup on failure
- Crash counter resets on manual feature toggle (previously stayed stuck after SPA navigation crashes)
- Merged duplicate _showToast wrappers into direct showToast calls
- SponsorBlock category descriptions now show detailed explanations in settings
- Added "Copy URL at Timestamp" to video context menu
- SponsorBlock segment count toast shown when segments are found
- Standardized web download button styling to match VLC/DL/MP3 pill buttons

## [2.2.0] - Architecture Hardening

- Centralized error boundaries for all feature init/destroy/toggle paths with DebugManager logging
- Settings migration versioning system (auto-migrates stored settings across version upgrades)
- Topological sort for feature initialization (parents always init before children)
- Fixed 37+ silent catch blocks with structured error logging
- Fixed empty destroy() methods: quickLinkEditor event listener leak, cobaltUrl GM storage cleanup
- Fixed playerContextMenu moviePlayer listener leak (stored reference + cleanup in destroy)
- Fixed Video Hider batch buffer not cleared on destroy
- Migrated chatStyleComments from standalone MutationObserver to central dispatcher
- Added DOM element cache (`cachedQuery`) with SPA navigation invalidation
- Debounced Video Hider `_processAllVideos()` to prevent rapid reprocessing on navigation
- Consistent `_initialized` state tracking across all toggle, reset, and navigation paths
- Fixed stale version strings (was showing 1.3.6 in console/exports)

## [2.1.0] - Refined Core

- Re-added auto-resume video position with configurable threshold
- Re-added GPU context recovery (monitor switch fix)
- Re-added sticky video (picture-in-picture while scrolling)
- Clean share URL stripping
- Video context menu with quick actions
- Quick link navigation menu
- Chat-style comments option
- Conflict detection for incompatible settings
- Feature preview descriptions in settings panel
- Dismissible page controls via `wrapPageControl`
- External ad filter list support via URL

## [2.0.0] - Core Rewrite

**Breaking:** Removed ChapterForge AI chapters and DeArrow clickbait removal to produce a lighter, focused core script.

- Removed ChapterForge (AI chapter generation, LLM providers, batch processing) → see [Chapterizer](https://github.com/SysAdminDoc/Chapterizer) for this functionality
- Removed DeArrow (crowdsourced title/thumbnail replacement)
- Removed external theme `@resource` dependencies (themes now inline)
- Enhanced ad blocker: extended prune keys, new ad renderer interception, regex-optimized `replaceAdKeys`, `jsonNeedsPruning` pre-check for performance
- Added endpoint interception for `/log_event`, `/ad_break`, `/pagead/`, `/doubleclick.net/`
- New Page Quick Settings modal (floating per-page context toggles)
- New `stripTracking` feature (removes `si`, `pp`, `feature`, `cbrd` params from shared links)
- New `quickLinkMenu` header navigation
- Added MIT license in script header
- Reduced script size by 54% (16,320 -> 7,413 lines)

## [1.3.0] - ChapterForge AutoSkip & Summary

- ChapterForge AutoSkip mode with 4 levels: off, gentle (long pauses), normal (pauses + fillers), aggressive (all gaps + speed silence)
- ChapterForge Summary mode: paragraph (clean prose) or timestamped (indexed format)
- DeArrow debug logging toggle for verbose console output
- SponsorBlock label retry limit (`LABEL_MAX_ATTEMPTS: 20`)
- Settings manager refactored for compactness

## [1.2.1] - Bug Fixes & Polish

- Minor refinements across existing features
- Stability fixes throughout the codebase
- No new major features

## [1.2.0] - DeArrow Integration

- DeArrow integration: crowdsourced better titles and thumbnails from the DeArrow database
- Replaces clickbait titles and thumbnails automatically
- Connects to `dearrow-thumb.ajay.app` for thumbnail replacements

## [1.1.0] - ChapterForge & Theme Manager

- ChapterForge: AI-powered chapter and point-of-interest generation
  - LLM provider support (OpenAI, OpenRouter, built-in)
  - Batch processing for multiple videos
  - Audio download via Innertube + Cobalt
- Theme Manager: consolidated Better Dark Mode and Catppuccin Mocha themes
- UI Style Manager: glassmorphism, gradient metallic styles
- Sticky video (picture-in-picture style player while scrolling)
- `cssFeature()` factory for boilerplate-free CSS-only features
- `IntersectionObserver` helper for performance
- Watch page element hider with granular toggles (title, views, date, channel avatar, etc.)
- Auto-skip "Still Watching" prompts
- Settings panel search functionality

## [1.0.0] - Stable Release

**First stable release.** Cleaned up experimental features for a focused, reliable core.

- Removed ProfilesManager (settings profiles)
- Removed KeyboardManager (keyboard shortcuts)
- Removed Statistics Dashboard
- Removed theater auto-scroll and comment navigator
- Simplified DebugManager to stub
- Retained full ad blocker with all 8 proxy/interception layers
- Retained TranscriptService, UndoManager, StorageManager, ChannelSettingsManager
- All core feature groups stable and tested

## [0.8.0] - Ad Blocker

**Major addition:** Full-featured ad blocker with split-architecture bootstrap.

- Two-phase ad blocker design:
  - Phase 1: Page-context proxy engine (bypasses Tampermonkey sandbox)
  - Phase 2: CSS/DOM observer + SSAP in userscript sandbox
- JSON.parse proxy to prune ad objects from parsed responses
- fetch() and XMLHttpRequest proxies to strip ad keys from network responses
- DOM bypass prevention and timer neutralization
- Promise.then anti-detection and property traps
- Video ad neutralizer (MutationObserver for `.ad-showing` class)
- Deep recursive ad pruner with 17+ ad renderer key types
- Massive CSS ad-hiding stylesheet (masthead, player, feed, search, sidebar, shorts, mobile)
- SSAP (Server-Side Ad Playback) detection and auto-skip
- Switched from `document-end` to `document-start` for early interception
- Auto-resume video position with configurable threshold
- Watch time tracker
- Speed indicator badge
- Playback speed on-screen display
- Theater auto-scroll
- Comment navigator
- Ad blocker settings pane in UI
- External filter list support via URL

## [0.7.0] - Broadened Scope

- Removed URL exclusions for `embed`, `shorts`, `playlist`, `results` pages
- Script now runs on more YouTube page types
- Minor refinements and fixes across existing features

## [0.6.0] - Architecture Overhaul

**Major rewrite** introducing service-based architecture.

- Unified `StorageManager` with cache, dirty-tracking, and debounced flush
- `TranscriptService`: multi-method transcript extraction with failover and language selection
- `UndoManager` for reversible actions
- `KeyboardManager` for shortcut handling
- `DebugManager` for structured logging
- `ProfilesManager`: save/load multiple settings configurations
- `ChannelSettingsManager`: per-channel setting overrides
- `TickManager`: periodic task execution engine
- `Trusted Types` safe HTML helpers for YouTube CSP compliance
- Page type detection (`PageTypes` enum + `getCurrentPage()`) for lazy-loading
- Settings version migration system
- Statistics dashboard in settings panel
- Profiles management UI
- Script size nearly doubled (8K -> 12K lines)

## [0.5.0] - Expanded Features

- Speed presets for playback
- Return YouTube Dislike integration
- Timestamp bookmarks
- Watch progress tracking
- Expanded content hiding options
- Embed player download option
- Video context menu additions

## [0.4.0] - Video Hider

- "Hide Videos" button: X overlay on video thumbnails in home/feeds
- Persistent hidden video list stored via `GM_setValue` with `localStorage` fallback
- Video ID extraction from multiple DOM patterns
- Undo toast with action button
- MutationObserver to continuously apply hiding to dynamically loaded content

## [0.3.0] - Downloads & Persistent Buttons

- Downloads group: VLC Player streaming (`ytvlc://` protocol)
- VLC Queue button (`ytvlcq://`)
- Local download via yt-dlp (`ytdl://` protocol)
- MPV Player button (`ytmpv://`)
- Download+Play button
- Subscriptions VLC Playlist
- Auto-download on visit option
- Download quality selector and preferred media player
- Persistent button injection system with 20+ fallback parent selectors
- Toast notification system with animations

## [0.2.0] - SponsorBlock & Trusted Types

- SponsorBlock (Lite): segment fetching from `sponsor.ajay.app` with category-based skipping
- Trusted Types safe SVG creation (`createSVG`)
- Notification button and badge hiding
- Square search bar and square avatars options
- No ambient mode, no frosted glass toggles
- Compact layout option
- Auto theater mode
- Persistent progress bar
- Auto-open chapters and transcript
- Chronological notifications
- Download provider selection (Cobalt/y2mate/savefrom)
- Hide playables, members-only content, news, playlists on home
- Premium UI with feature cards and accent colors
- Removed Modern Dark Theme sub-features and Nyan Cat progress bar

## [0.1.0] - Initial Release

The first version of YTKit as a Tampermonkey userscript.

- Header tweaks: hide Create button, Voice Search, logo redirect to subscriptions, widen search bar
- Sidebar hiding
- Theme support: native dark mode, Better Dark Mode, Catppuccin Mocha, Modern Dark Theme (blur, zen mode, padded sections, premium logo, PiP, branding, progress gradient, squarify)
- Nyan Cat progress bar
- Content: remove/redirect Shorts, disable hover preview, 5 videos per row, hide paid content
- Watch page: fit player, hide related, adaptive live layout, expand video width, floating logo
- Behavior: prevent autoplay, auto-expand description, sort comments newest first
- Clutter: hide merch shelf, clarify boxes, hashtags, pinned comments, end cards
- Live chat: 12+ individual toggles (header, menu, popout, reactions, timestamps, polls, ticker, super chats, bots, etc.)
- Action buttons: hide like/dislike/share/clip/thanks/save/sponsor, Cobalt downloader
- Player controls: hide SponsorBlock, next, autoplay, subtitles, miniplayer, PiP, theater, fullscreen
- Quality: auto max resolution, enhanced bitrate
- Advanced: external adblock toggle, CPU tamer, handle revealer, yout.ube redirect
- Settings panel with import/export, toast notifications
- Bot filter and keyword filter for comments
