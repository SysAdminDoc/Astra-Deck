# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

## Deep-audit backlog — 2026-07-23 (verified, unfixed)

- [ ] P3 — Theming coherence backlog: light-theme cards for subscription digest/health/members/create-group dialog; a corner-stacking registry for bottom-right fixed UI (queue pill vs reaction launcher vs bulk bar vs shorts chip); accent consolidation onto --ytkit-accent-rgb (orange/purple/blue drift); Roboto for inline-in-YouTube surfaces; cap split-mode dropdown and AI-summary z-index below the settings modal; remaining physical margins → logical (subscription-groups chips/badges, return-dislike, queue thumbnail button).
  Where: extension/features/subscription-groups/index.js, extension/ytkit.js (Z table consumers, aisum panel, queue), features/return-dislike/index.js
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
