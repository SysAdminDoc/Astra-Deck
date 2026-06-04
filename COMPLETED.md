# Astra Deck Completed Work

This file summarizes shipped roadmap arcs. Active work lives in `ROADMAP.md`;
release-level details live in `CHANGELOG.md`.

## v5.1 Carry-Forward Arc

- Selector-pack migration completed across seven batches.
- DOM-layer toast extraction shipped through `core/toast-dom.js`.
- Array/object JSON editors completed schema overview coverage for all settings
  keys.
- Profile badges and label/description override fields shipped in schema rows.
- Several v5.2+ follow-ups remain in `ROADMAP.md`, including live-chat capture,
  lifecycle migration, and i18n translation depth.

## v5.0 Foundation Arc

- Settings-schema single source of truth and schema coverage gate.
- Core feature lifecycle and policy profile helpers.
- Selector-health, lifecycle route bridge, and data-flow origin catalog.
- Popup data-flow panel, privacy quick toggles, risk badges, category overview,
  search, and inline editors for boolean/number/string settings.
- Userscript bundle of the core modules.
- Feature peels for subtitle CSS, video filters, blue-light filter, theme CSS,
  wave-8 CSS, and home/subscriptions CSS clusters.

## Recent Hardening And Polish

- Quick Links capped at 10 slots.
- PyQt6 GUI smoke tests for downloader folder picker flows.
- On-demand yt-dlp self-update endpoint and popup action.
- Premium welcome-card and dynamic-status microcopy polish.
- Earlier hardening passes across DeArrow, SponsorBlock, settings, downloader,
  background fetch proxying, Trusted Types, selector regressions, and userscript
  parity remain detailed in `CHANGELOG.md` and `HARDENING.md`.

## Consolidated From Legacy Planning Documents (2026-06-03)

Items below were triaged out of the local factory-loop research pass
(2026-04-24, charter "maintenance mode — security focused"). The raw research
artifacts live under the gitignored `docs/research/` tree and are summarized in
`RESEARCH_REPORT.md`.

### Shipped Features

- [x] Pin `yt-dlp` / `curl_cffi` floor + per-package upper bounds (research
  NOW-1): closes the command-injection / SSRF advisory cluster. Pins now live in
  `astra_downloader/requirements.txt` with a runtime Python-floor guard in
  `astra_downloader.py` — *Source: docs/research/iter-1-scored.md, PHASE-2-5-SUMMARY.md*
- [x] DNS-rebinding defense / Host-header validation on the local Flask listener
  (research NOW-2): `is_allowed_host()` + `Invalid Host header` 421 rejection in
  `astra_downloader/astra_downloader.py` (v3.15.0) — *Source: docs/research/iter-1-scored.md*
- [x] Trusted Types `createPolicy()` collision guard (research NOW-3):
  `ytkit-policy` is created defensively with a `DOMParser` fallback in
  `extension/ytkit.js` (v3.20.2) — *Source: docs/research/iter-1-scored.md*
- [x] Migrate transient background state to `chrome.storage.session` (research
  NEXT-2/3): pending-reveal mirroring shipped in `extension/background.js`
  (v3.20.0) — *Source: docs/research/iter-1-scored.md*
- [x] ESLint custom rule flagging non-top-level `addListener` in the service
  worker (research NEXT-4): shipped as the `local/no-post-await-addlistener`
  rule in `eslint.config.js` / `scripts/eslint-rules/` — *Source: docs/research/iter-1-scored.md*
- [x] Dependabot dependency-update config (research NEXT-1 partial):
  `.github/dependabot.yml` is in place; the yt-dlp smoke-test automation half
  remains active in `ROADMAP.md` — *Source: docs/research/iter-1-scored.md*

### Stale / Obsolete Items

- [STALE] "No further features are planned — maintenance mode only" charter cap
  of 3 NOW items — *Reason: superseded by the 2026-05-21 v5.0.0 foundation sprint
  and the active feature backlog (subscription groups, video notes, companion
  updater) now tracked in ROADMAP.md. Source: docs/research/README.md, iter-1-audit.md*
- [STALE] 18+ "REJECTED" landscape candidates from the 2026-04-24 harvest —
  *Reason: closed as no-go at harvest time; retained only in the local research
  archive, not promoted. Source: docs/research/iter-1-scored.md*
