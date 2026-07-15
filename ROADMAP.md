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
- [ ] P3 — New chat/workbench surfaces are hardcoded dark and use physical left/right properties
  Why: the parent-page chat shell, reaction panel, and workbench button clash with light YouTube (siblings use --yt-spec-* vars), and the live-chat message row (menu right-pinned, avatar left-pinned) is visibly broken in RTL (ar ships). Migrate to theme vars and logical properties (padding-inline, inset-inline-*). The settings-panel v3 layer's physical properties were converted 2026-07-15; the live-chat/workbench surfaces remain (edit premiumLiveChat in ytkit.js then run scripts/generate-live-chat-css.js).
  Where: extension/live-chat.css (generated), extension/ytkit.js (premiumLiveChat source, workbench CSS)
- [ ] P3 — Sidepanel/Firefox sidebar surface is hardcoded English across an 11-locale extension
  Why: the popup is fully localized (t() + data-i18n + 11 _locales), but sidepanel.js/sidepanel.html/sidebar.html never touch ext.i18n (statuses, empty states, QUICK_SETTINGS labels), and there is no RTL dir handling unlike popup.js:213-227. Reuse the popup's t()/applyI18n/applyDocumentLanguage helpers (or extract to core) and add locale keys.
  Where: extension/sidepanel.js (~62-66, ~202-224, ~431-448, ~527-579, ~727-753), extension/sidepanel.html, extension/sidebar.html
- [ ] P3 — Residual hardcoded English in otherwise-localized popup flows
  Why: the AI credential section is the only major popup section with zero data-i18n; credential statuses, import preview status, companion "Open a YouTube tab first" (its yt-dlp twin at ~4182 correctly uses t()), Reset success copy, and schema-overview badge/tooltip text surface untranslated sentences inside localized flows.
  Where: extension/popup.html (~187-213), extension/popup.js (~1497-1568, ~3916, ~4226, ~4603-4604, ~2695-2746, ~3048)
