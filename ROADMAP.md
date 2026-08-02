# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

## Deep-audit backlog — 2026-07-23 (verified, unfixed)

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
- [ ] P3 — Microcopy normalization pass: "…" vs "...", em-dash vs spaced hyphen, digest empty-state pointing at the + Group control, disabled Mark-read explanation, dedicated sidepanel keys instead of reused toggle/download keys, and truthful companion maintenance copy (12h start/queue-idle yt-dlp cadence; staged ffmpeg replacement rather than delete-first)
  Where: extension/_locales/en/messages.json, extension/sidepanel.html:50,118,126, features/subscription-groups/index.js:1081,1110-1114, astra_downloader/gui.py (_build_settings)

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

### P3 — Under consideration: breadth, coherence, and larger bets

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

## Research-Driven Additions — 2026-07-29

Source evidence and rejected alternatives: `RESEARCH.md` (2026-07-29). No P0: JavaScript and resolved Python advisory scans are clean; existing policy/operator blockers remain in `Roadmap_Blocked.md`.

### P1 — Existing-promise correctness and runtime containment

### P2 — Accessibility, regression coverage, and retained-data access

### P3 — Conservative platform capability

- [ ] P3 — Add a power-efficient automatic codec mode with a no-op fallback
  Why: Astra can force a codec or disable CPU-heavy features, but cannot use the browser's device-specific smooth/power-efficient decoding signal; this is a low-power improvement only when the API can discriminate.
  Evidence: `extension/ytkit-main.js` (`MediaCapabilities.decodingInfo`/codec bridge), `extension/ytkit.js` (`codecSelector`, `lowPowerMode`); https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo
  Touches: `extension/ytkit-main.js`, codec settings schema/defaults/locales, low-power profile, codec bridge tests.
  Acceptance: the new mode probes candidate codec configurations, prefers only a supported smooth and power-efficient result when candidates differ, caches by device/config for the session, and preserves current `auto` behavior when the API is absent, rejects, or reports indistinguishable results.
  Complexity: M
