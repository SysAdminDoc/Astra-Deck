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

- [ ] P3 — Live-browser behavioral audit of the extension feature modules
  Why: the 2026-07-20 audit pass deeply traced the companion (GUI state machine, HTTP/auth boundary, settings validation) and fixed a status-tone inconsistency, but the extension feature modules' *runtime* logic (e.g. `extension/features/download-ui/index.js`, video-hider, subscription-groups) was only spot-checked; the static a11y/contrast/i18n/lint gates and unit tests pass, but behavioral bugs on live YouTube DOM (empty/error/offline states, feature auto-disable-on-miss) are not covered by fixtures.
  Where: `extension/features/**/index.js`, live YouTube watch/subscriptions/live-chat surfaces.

## Research-Driven Additions — 2026-07-20 (competitive + yt-dlp ecosystem sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-20). Most competitor breadth is already shipped; these are the verified remaining gaps. Extension features reuse the external-api-health/degradation-surface pattern with per-feature auto-disable-on-DOM-miss.

### P3 — Hardening + small verified viewer gaps

- [ ] P3 — Exact (non-rounded) view/like/comment counts
  Why: Astra surfaces exact dislike counts via its Return-YouTube-Dislike integration but leaves YouTube's rounded "1.2M" view/like/comment labels; exact counts are a recurring viewer-side ask and a paywalled creator-tool feature.
  Evidence: https://github.com/Shraymonks/YouTube-Exact-Like-Count; YouTube Redux (precise like/dislike values); grep found no `exactCount`/`preciseCount` setting.
  Touches: `extension/ytkit.js` (or a small `extension/features/*` module), `extension/default-settings.json` (new off-by-default setting + i18n copy), locale catalogs, i18n coverage/copy gates.
  Acceptance: with the setting on, view/like/comment counts render un-abbreviated (from the player/metadata response, not by re-parsing "1.2M"); off by default; auto-disables and reports degradation if the source field shape drifts.
  Complexity: M

- [ ] P3 — Copy video URL at the current timestamp
  Why: quick, high-demand viewer utility absent from Astra's video context menu; competitors expose it as a one-click/hotkey action.
  Evidence: YouTube-Enhancer (VC fork) "copy URL with timestamp"; grep found no `copyTimestamp`/`urlWithTimestamp` setting or menu action.
  Touches: `extension/features/*` video context-menu surface (reuse the existing Video Context Menu), `extension/default-settings.json`, locales.
  Acceptance: a context-menu/action item copies `https://youtu.be/<id>?t=<seconds>` for the currently playing video at the current position; verified on a standard watch page; respects the existing menu enable/disable settings.
  Complexity: S

- [ ] P3 — Scroll-over-volume-area to adjust volume
  Why: scroll-to-change-volume was removed in the 2025 YouTube redesign and is a common restore in Enhancer/Iridium; Astra has volume boost but not this interaction.
  Evidence: RESEARCH.md 2026-07-20 §Competitive Landscape (Enhancer/Iridium; 2025 redesign complaint threads); grep found no `scrollVolume`/`wheelVolume` setting.
  Touches: `extension/features/*` player interaction module, `extension/default-settings.json`, locales.
  Acceptance: with the setting on, wheel events over the player volume area adjust volume in fixed steps without page scroll; off by default; auto-disables on player-DOM miss.
  Complexity: M
