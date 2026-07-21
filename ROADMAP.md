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

- [ ] P2 — Retire the breaking-only dev-dependency advisories
  Why: `web-ext@10.4.0`'s tree pulls vulnerable `adm-zip` (<0.6.0, crafted-ZIP 4 GB alloc) and `shell-quote` (<=1.8.4, `parse()` quadratic DoS). Both are dev/build-tool only — `npm audit --omit=dev` reports 0 vulnerabilities, so the shipped extension and companion are unaffected. The only `npm audit fix` route is `--force`, which downgrades to `web-ext@0.0.1` (unacceptable). Resolve by moving to a `web-ext` line whose `fx-runner`/`firefox-profile` no longer depend on the vulnerable versions, then re-pin.
  Where: package.json (devDependencies.web-ext), package-lock.json
- [ ] P3 — Render the companion empty-state glyph at native size
  Why: `make_empty_state` requests `make_line_icon(...).pixmap(36, 36)` from an icon drawn on a fixed 18×18 canvas, so the Downloads/History empty-state glyphs are upscaled 2× and read slightly soft. Give `make_line_icon` an optional target size (scale the draw coordinates) so the glyph rasterizes crisply at 36 px.
  Where: astra_downloader/gui.py (make_line_icon, make_empty_state)
