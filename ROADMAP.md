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
