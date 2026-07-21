# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

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

### P1 — Correct just-shipped extraction behavior

- [ ] P1 — Fix the token-exempt fallback client chain
  Why: the chain shipped 2026-07-21 (`tv,android_vr,web`) has two defects — bare `web` is NOT token-exempt (SABR-only without a GVS token, and yt-dlp cannot download SABR since the native SABR downloader PR #13515 is unmerged, so `web` is dead weight that yt-dlp skips/403s), and `android_vr` is erratic in 2026 (intermittent format-18-only 360p drops, `UNPLAYABLE` on "made for kids") so it should not be the second client in an unattended chain.
  Evidence: yt-dlp PO-Token Guide (exempt set = `tv`/`android_vr`/`web_embedded`, `web` needs a GVS token); issues #12482 (`web` SABR-only), #16150 (android_vr format-18 regression), #15780 (android_vr UNPLAYABLE on kids), #15583 (tv LOGIN_REQUIRED on age-gated); PR #13515 (SABR downloader unmerged); `astra_downloader/health.py` `build_youtube_extractor_args`.
  Touches: `astra_downloader/health.py` (the `youtube:player_client=…` string), `astra_downloader/test_astra_downloader.py` (update the fallback assertion).
  Acceptance: `build_youtube_extractor_args` emits `youtube:player_client=tv,web_embedded,android_vr` when the PO-token provider is absent; the test asserts the new chain (no bare `web`, `android_vr` last) and that it is omitted when the provider is `ok`.
  Complexity: S

### P3 — Degradation UX

- [ ] P3 — Nudge to install a PO-token provider when an exempt-chain download degrades or fails
  Why: no token-free client covers the full catalog at full quality — `tv` fails `LOGIN_REQUIRED` on age-gated/members content, `android_vr` fails kids/age-gated, `web_embedded` only covers embeddable videos; when a download on the exempt chain fails or falls back to a low format, the user has no guidance that a PO-token provider would fix it. The dashboard "PO provider: Fallback" row is passive.
  Evidence: RESEARCH.md 2026-07-21 §Security/Reliability (inherent coverage gap); yt-dlp issues #15583, #15780; `astra_downloader/download.py` failure-classification path (`classify_download_failure`, `error_advice`).
  Touches: `astra_downloader/download.py` (map LOGIN_REQUIRED/UNPLAYABLE/format-degraded outcomes to advice), companion download-card `error_advice` surface, popup health banner.
  Acceptance: when a YouTube download fails with a sign-in/age-gate/UNPLAYABLE class or completes with only a 360p muxed format while no provider is running, the error/advice line explicitly suggests installing a PO-token provider; unchanged when a provider is live.
  Complexity: M
