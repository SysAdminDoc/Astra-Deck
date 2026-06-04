# Astra Deck Roadmap

> Single source of truth for all planned work. Items above the `---` are existing
> plans; items below are research conducted 2026-06-03.

Shipped work is summarized in [COMPLETED.md](COMPLETED.md) and detailed in
[CHANGELOG.md](CHANGELOG.md). Research is summarized in
[RESEARCH_REPORT.md](RESEARCH_REPORT.md). The pre-consolidation research plans
are archived under `docs/archive/research/`, and the legacy v5.2.0 → v6.0.0
product dossier (competitive matrix, feature catalog, technical reconnaissance,
phased feature plan) is preserved at
[docs/archive/roadmap-dossier-2026-05-21.md](docs/archive/roadmap-dossier-2026-05-21.md).

## Existing Planned Work

### Browser-Bounded Captures

- [ ] P0 — Capture YouTube liquid-glass player chrome (HARDENING H21, EI9)
  - Why: the watch-page player redesign (`.ytp-delhi-modern`, action pills,
    overflow panels, bottom controls) is high-churn; large player UI work needs
    a fresh capture-backed selector set.
  - Touches: `mhtml/`, `extension/core/selector-packs/`, critical selector set.
  - Acceptance: the watch-page fixture is refreshed and liquid-glass selectors
    are promoted into the critical selector set. _(Partial 2026-06-04: DOM probe
    confirmed and promoted `ytp-delhi-modern`, `ytp-overflow-panel`, and
    `ytp-time-wrapper-delhi`; full watch-page MHTML capture still times out under
    DevTools automation and needs a manual/stable-browser save path.)_
  - Source: ROADMAP.md Active Backlog (Browser-Bounded Captures)
- [ ] P2 — MHTML capture-week expansion (EI15 + NF19)
  - Why: Shorts, channel, search, history, watch-later, embedded player, and
    notifications surfaces have no capture-backed fixtures, leaving their
    selector packs unverified against real DOM.
  - Touches: `mhtml/`, `extension/core/selector-packs/`, `scripts/build-selector-fixtures.js`.
  - Acceptance: fixtures and selector packs exist for each listed surface.
  - Source: ROADMAP.md Active Backlog (Browser-Bounded Captures)

### Companion, Subscriptions, And Research

- [ ] P1 — Astra Downloader `/update` endpoint + popup action (NF6)
  - Why: there is no user-visible companion update path; updates today require a
    manual reinstall.
  - Touches: `astra_downloader/astra_downloader.py`, popup action UI.
  - Acceptance: a `/update` endpoint with semver compare, atomic replace, and
    restart is reachable from a popup action.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P2 — Nested subscription groups (NF2)
  - Why: subscription groups are flat; power users (PocketTube parity) want
    depth-2 organization.
  - Touches: subscription-groups feature module, settings schema, import/export.
  - Acceptance: depth-2 groups work with JSON round-trip coverage.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P2 — Dead-channel detection + bulk unsubscribe staging
  - Why: stale channels accumulate; bulk unsubscribe is irreversible without a
    safety surface.
  - Touches: subscription-groups feature module, undo/staging UI.
  - Acceptance: stale channels are flagged and bulk unsubscribe routes through a
    30-day undo window.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P2 — Per-video notes (`videoNotes`) (NF1)
  - Why: a local-first per-video notes surface is a top product gap versus
    YouTube Alchemy / research tools.
  - Touches: `videoNotes` schema/UI, export, storage caps.
  - Acceptance: notes schema/UI ships with export support and a 1000-note LRU cap.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P2 — Astra Downloader signed installer + MSI
  - Why: an unsigned companion is a trust/onboarding friction point for non-dev
    users.
  - Touches: `astra_downloader/build.py`, release packaging, signing.
  - Acceptance: a signed installer/MSI is produced. _(Deferred until CWS
    submission intent and signing budget are decided.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P3 — Group notifications digest panel
  - Why: users want per-group new-video awareness without opening every group.
  - Touches: subscription-groups feature module, popup/overlay UI.
  - Acceptance: a panel shows per-group new-video counts since last visit.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P3 — Study/work mode export to Markdown/CSV
  - Why: research-mode users want to export tracked time / focused history.
  - Touches: study/work-mode feature, export helpers.
  - Acceptance: study/work mode data exports to Markdown and CSV.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P3 — i18n feature-definition labels out of `ytkit.js` (EI6)
  - Why: feature-definition labels are inline English in the monolith, blocking
    real localization depth.
  - Touches: `extension/ytkit.js`, locale bundles, `_locales/`.
  - Acceptance: feature-definition labels resolve through the i18n layer instead
    of inline English strings.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [ ] P3 — Store-safe vs GitHub-full separate build artifacts
  - Why: download / ad-skip / Cobalt features may require GitHub-full only; a
    single artifact risks store-policy rejection.
  - Touches: `build-extension.js`, policy-profile, release packaging.
  - Acceptance: store-safe and GitHub-full artifacts are generated separately
    from one source of truth.
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)

### Hardening And Cross-Browser

> Triaged out of the local 2026-04-24 factory-loop research pass (NEXT tier) and
> confirmed still-actionable against current code; the already-shipped NOW/NEXT
> items from that pass are recorded in `COMPLETED.md`.

- [ ] P2 — Monthly yt-dlp version-bump + smoke-test CI (research NEXT-1)
  - Why: yt-dlp is the highest-churn dependency; silent extractor breakage ships
    a non-functional downloader. Dependabot opens dependency PRs but there is no
    automated download smoke test to gate a yt-dlp bump.
  - Touches: `.github/workflows/`, `astra_downloader/requirements.txt`.
  - Acceptance: a scheduled/`workflow_dispatch` job installs the pinned yt-dlp,
    runs a minimal extract/download against a known stable video, and turns red
    on a deliberately-broken pin.
  - Source: docs/archive/research/ (iter-1-scored NEXT-1), PHASE-2-5-SUMMARY
- [ ] P2 — Selector-resilience test harness over `mhtml/` fixtures (research NEXT-5)
  - Why: runtime DOM churn is the top carried risk; a fixture-backed harness
    catches selector rot before users do.
  - Touches: `scripts/build-selector-fixtures.js`, `tests/`, `mhtml/`.
  - Acceptance: a test fails when a critical selector no longer matches its
    captured fixture; coverage spans the live-chat and liquid-glass packs.
  - Source: docs/archive/research/ (iter-1-scored NEXT-5)
- [ ] P2 — Firefox 149 pre-flight `scripting.executeScript` audit (research NEXT-6)
  - Why: Firefox MV3 `scripting.executeScript` has diverged from Chromium; a
    pre-flight catches injection-target breakage cheaply before AMO submission.
  - Touches: `extension/background.js`, `extension/*.js`, `docs/`.
  - Acceptance: an audit note records Firefox-Nightly behavior of every
    `executeScript` call site; any `moz-extension://` divergence is filed.
  - Source: docs/archive/research/ (iter-1-scored NEXT-6, borderline NOW)
- [ ] P2 — Allowlist yt-dlp flags at the Flask boundary (research, deferred)
  - Why: complements the yt-dlp pin; makes the no-passthrough invariant explicit
    and enforced rather than incidental, so a future feature cannot widen the
    surface unintentionally.
  - Touches: `astra_downloader/astra_downloader.py`.
  - Acceptance: yt-dlp invocation rejects any flag outside a reviewed allowlist;
    a test asserts an unexpected flag is refused.
  - Source: docs/archive/research/ (iter-1-scored under-consideration / NEXT)

### Carried Risks And Open Questions

- [ ] P2 — Bound storage growth for `videoNotes`, `timestampBookmarks`, and `videoHistory` (R4)
  - Why: unbounded local-storage maps are a long-session memory / quota risk.
  - Touches: storage-manager, the affected feature modules.
  - Acceptance: each map enforces a documented cap with deterministic eviction.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)
- [ ] P3 — Finish `policy-profile.js` scrub-regex coverage (R6)
  - Why: incomplete scrub-regex coverage risks leaking gated values into
    store-safe / export profiles.
  - Touches: `extension/core/policy-profile.js`, scrub tests.
  - Acceptance: scrub-regex coverage spans all gated keys with tests.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)
- [ ] P3 — Surface a Cobalt fallback unreachable diagnostic (R8)
  - Why: when the Cobalt fallback is unreachable the failure is currently silent.
  - Touches: downloader fallback path, diagnostic-log.
  - Acceptance: an unreachable Cobalt instance produces an actionable local
    diagnostic.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)
- [ ] P3 — Add a long-session memory-leak test (G3)
  - Why: rich grid cards recycle aggressively; observer/diagnostic growth needs a
    standing regression guard.
  - Touches: `tests/`.
  - Acceptance: a long-session test shows bounded observer work and no unbounded
    diagnostics maps.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)

> Open decisions carried forward: downloader signing budget, CWS/AMO submission
> intent, dead-channel detection method, lifecycle migration cadence, live-chat
> capture window, and i18n coverage warning policy.

---

## Research-Driven Additions

<!-- Populated by the 2026-06-03 deep-research pass below. -->
