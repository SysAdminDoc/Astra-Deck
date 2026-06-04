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
- On-demand Astra Downloader companion self-update endpoint and popup action.
- Nested subscription groups with depth-2 JSON import/export.
- Dead-channel subscription detection with 30-day unsubscribe staging and undo.
- Per-video notes with JSON export and a 1000-note LRU cap.
- Premium welcome-card and dynamic-status microcopy polish.
- Earlier hardening passes across DeArrow, SponsorBlock, settings, downloader,
  background fetch proxying, Trusted Types, selector regressions, and userscript
  parity remain detailed in `CHANGELOG.md` and `HARDENING.md`.

## Active Backlog Ships Folded Into COMPLETED (2026-06-03)

These items were marked `[x]` in the ROADMAP.md "Active Backlog" before the
2026-06-03 roadmap consolidation. They are recorded here so the lean ROADMAP can
carry only open work.

### Shipped Features

- [x] Capture live-chat MHTML fixtures (EI8) — refreshed the three live-chat
  selector packs and token fixture. *(Delivered 2026-06-04: committed
  `yt-live-chat.tokens.txt` from `mhtml/LiveChat.mhtml`; wrapper selectors were
  verified by rendered watch-page DOM probe because full watch-page MHTML capture
  timed out in headless Chrome.)* — *Source: ROADMAP.md Active Backlog*
- [x] `stickyVideo` unify chat observer lifecycle (NF32) — merged the duplicate
  chat watcher paths into one `_chatObserver` + `_chatObserverTimer` init/destroy
  lifecycle. *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] `subscriptionGroups` per-group sort persistence (NF31) — active group
  records now persist `sortMode`; `subscriptionSortMode` remains only as the
  all-subscriptions / legacy fallback. *(Delivered 2026-06-04.)* — *Source:
  ROADMAP.md Active Backlog*
- [x] `chatStyleComments` selector fallbacks (EI-NEW1) — reply-dialog `:has()`
  hiding is fenced by `@supports selector(:has(*))` with a `.ytkit-replying`
  class fallback. *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] `hideVideosFromHome` channel-key cache (EI-NEW5) — blocked-channel records
  maintain a cached identity-key `Set`; per-card checks use direct key membership.
  *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] `selector-health` attribute-drift detection (EI-NEW6) — selector health now
  samples hashed class/attribute signatures and surfaces shape drift even when
  selectors keep hitting. *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] `require-catch-reason` lint rule extended to `extension/core/*.js` and
  `extension/ytkit.js` after the per-file catch-annotation pass. *(Delivered
  2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] Wave 3 lifecycle full delegate — `core/styles.js` exposes
  `createCssLifecycleSpec`; home/subs, wave-8, and theme CSS peels register real
  style specs and `cssFeature` delegates through lifecycle start/destroy.
  *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] Top-3 monolith peel — split `stickyVideo`, `hideVideosFromHome`, and
  `chatStyleComments` into `features/*` modules with monolith delegation and
  inline fallbacks preserved. *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] Next-2 monolith peel — split `youtubeMusicCompat`
  (`features/youtube-music-compat/`) and `floatingLogoOnWatch`
  (`features/player-dock/`) into feature modules. *(Delivered 2026-06-04.)* —
  *Source: ROADMAP.md Active Backlog*
- [x] Astra Downloader `/update` endpoint + popup action (NF6) — companion
  updates now compare `APP_VERSION`, download the latest GitHub Release
  `AstraDownloader.exe`, validate it, schedule an atomic replace/restart, block
  while downloads are active, and surface a popup action through the YouTube tab
  bridge. *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] Nested subscription groups (NF2) — `subscriptionGroupData` now supports
  depth-2 `parentId` records, schema v2 export/import, parent filters that union
  child group channels, and toolbar child chips plus `+ Subgroup` creation.
  *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] Dead-channel detection + bulk unsubscribe staging — rendered subscription
  cards now flag channels whose newest visible upload is at least 365 days old,
  and `subscriptionUnsubscribeStagingData` records staged review entries with a
  30-day undo window instead of directly clicking unsubscribe controls.
  *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*
- [x] Per-video notes (`videoNotes`) — watch pages now have a local notes panel
  backed by `videoNotesData`, versioned JSON export, delete/undo for the current
  video, and a deterministic 1000-note LRU cap by `updatedAt`.
  *(Delivered 2026-06-04.)* — *Source: ROADMAP.md Active Backlog*

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
