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

- [ ] P3 — Localize the Watch Later Workbench and reaction sender surfaces
  Why: both shipped fully hardcoded-English (panel labels, placeholders, sort options, toasts) and the literals were baselined into scripts/i18n-ui-copy-baseline.json; the live-chat module does not even receive t(). Route through locale keys and shrink the ratchet baseline.
  Where: extension/ytkit.js (watchLaterWorkbench ~32535-32830), extension/features/live-chat/index.js (reaction panel ~301-429)
