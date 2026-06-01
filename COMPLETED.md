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
