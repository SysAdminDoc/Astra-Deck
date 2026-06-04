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

- [x] P1 — Astra Downloader `/update` endpoint + popup action (NF6)
  - Why: there is no user-visible companion update path; updates today require a
    manual reinstall.
  - Touches: `astra_downloader/astra_downloader.py`, popup action UI.
  - Acceptance: a `/update` endpoint with semver compare, atomic replace, and
    restart is reachable from a popup action. _(Delivered 2026-06-04: the
    endpoint compares `APP_VERSION`, downloads the latest GitHub Release
    `AstraDownloader.exe`, validates and schedules an atomic replace/restart,
    blocks while downloads are active, and is reachable from the popup through
    the YouTube content-script bridge. `APP_VERSION` remains `1.5.1` until a
    matching companion binary release is built and published.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [x] P2 — Nested subscription groups (NF2)
  - Why: subscription groups are flat; power users (PocketTube parity) want
    depth-2 organization.
  - Touches: subscription-groups feature module, settings schema, import/export.
  - Acceptance: depth-2 groups work with JSON round-trip coverage. _(Delivered
    2026-06-04: group records now carry `parentId`, exports moved to schema v2,
    imports preserve valid parent links while rejecting child-of-child depth,
    parent filters include child-group channels, and the toolbar renders child
    chips plus a top-level-only `+ Subgroup` action.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [x] P2 — Dead-channel detection + bulk unsubscribe staging
  - Why: stale channels accumulate; bulk unsubscribe is irreversible without a
    safety surface.
  - Touches: subscription-groups feature module, undo/staging UI.
  - Acceptance: stale channels are flagged and bulk unsubscribe routes through a
    30-day undo window. _(Delivered 2026-06-04: rendered subscription cards now
    parse age text, flag channels whose newest rendered upload is at least 365
    days old, stage review records in `subscriptionUnsubscribeStagingData` with
    `undoUntil` set 30 days out, and expose scan/stage/undo toolbar actions
    without clicking YouTube unsubscribe controls.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [x] P2 — Per-video notes (`videoNotes`) (NF1)
  - Why: a local-first per-video notes surface is a top product gap versus
    YouTube Alchemy / research tools.
  - Touches: `videoNotes` schema/UI, export, storage caps.
  - Acceptance: notes schema/UI ships with export support and a 1000-note LRU
    cap. _(Delivered 2026-06-04: `videoNotes` adds a watch-page local notes
    panel, stores sanitized records in `videoNotesData`, exports a versioned
    `astra-deck-video-notes-YYYY-MM-DD.json` archive, and keeps the 1000 most
    recently updated notes by `updatedAt`.)_
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
> intent, real-browser QA for dead-channel staging at large feed scale,
> lifecycle migration cadence, live-chat capture window, and i18n coverage
> warning policy.

---

## Research-Driven Additions

*Research conducted 2026-06-03. Items below are new — not duplicates of Existing
Planned Work.*

Grouped by category, ordered P0 → P3. Each item is evidence-tied to the current
tree (manifest, settings schema, core modules, build scripts, workflows,
companion service) and to the competitive / standards landscape (Chrome Web Store
MV3 program policy, AMO Firefox MV3, WCAG 2.2 AA, the SponsorBlock / DeArrow /
Enhancer for YouTube / PocketTube / BlockTube / Return YouTube Dislike ecosystem,
and yt-dlp cookie-handling advisories).

2026-06-04 refresh: NF6, NF2, and dead-channel staging have moved into the live
dirty tree, with `node --test tests/hardening.test.js` passing 415 checks and
`npm audit --audit-level=high --omit=dev` finding 0 vulnerabilities. Current
Chrome Web Store, Firefox MV3, yt-dlp, and YouTube Data API source checks keep
the existing store-policy, Firefox smoke, yt-dlp smoke, and local-first
subscription-staging rows relevant; no new duplicate research row was promoted.

### Phase 1 Competitive Matrix Carry-Forward

The full competitive matrix lives in
`docs/archive/roadmap-dossier-2026-05-21.md`; these two rows stay visible here
because the v4.47.0 polish batch promoted them as active comparison references.

| # | Competitor | Owner | Surfaces | Status | Scope | Relevant Astra parity surface | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 21 | Iridium for YouTube | iridiumio | Chrome, Edge, Firefox | CWS listing active (noted in `docs/research/iter-8-sources.md`, added 2026-05-20). Closed-source. | broad | Codec/quality controls, player polish, ad/sponsor handling; overlaps Astra's `qualityProfileMatrix` + `forceH264` surface. | https://chromewebstore.google.com/detail/iridium-for-youtube/ |
| 22 | Control Panel for YouTube | Jasper de Groot | Chrome, Firefox | CWS listing noted in iter-8 sources (2026-05-20); deeper feature scoring pending. | broad | UI tweaks + control panel for layout / Shorts / channels; presumed quality/UI control. | CWS listing per iter-8 sources |

### Quick Wins

- [ ] P1 — Reconcile version surfaces and retire the "v5.0.0 foundation" framing
  - Why: the shipping product is `4.46.0` (`package.json`, `extension/manifest.json`,
    `docs/architecture.md`), yet `COMPLETED.md` and the archived dossier describe a
    "v5.0.0 foundation arc effectively complete" and a v5.0.0 → v6.0.0 plan. A
    reader cannot tell the real release line from the planning line, and
    `check-versions.js` only validates the surfaces it knows about.
  - Evidence: `package.json` version `4.46.0`; `extension/manifest.json` version
    `4.46.0`; `docs/architecture.md` "(what is, today, at v4.46.0+)"; COMPLETED.md
    "v5.0.0 Foundation Arc" / "v5.1 Carry-Forward Arc"; archived dossier
    "v5.0.0 foundation arc effectively complete." [Verified]
  - Touches: `COMPLETED.md`, `RESEARCH_REPORT.md`, `docs/architecture.md` doc
    prose only (no code).
  - Acceptance: every doc states the real shipped version (4.46.x) and labels the
    v5/v6 numbering explicitly as an internal planning track, not shipped releases.
  - Verify: `node scripts/check-versions.js` stays green; grep for "v5.0.0" /
    "v6.0.0" finds only planning-track-labelled mentions.
  - Complexity: S
- [ ] P1 — Add per-permission justification + single-purpose store note for review
  - Why: the extension requests `cookies` + `downloads` and 14 host origins
    spanning YouTube, SponsorBlock, Return YouTube Dislike, three AI providers
    (OpenAI/Anthropic/Gemini), Reddit, and seven `127.0.0.1` companion ports.
    Chrome Web Store MV3 policy flags "toolbars that provide a broad array of
    functionality" and requires a written justification per sensitive permission;
    missing/insufficient justification is a top rejection cause.
  - Evidence: `extension/manifest.json` `permissions` (`cookies`, `downloads`,
    `unlimitedStorage`) and 17-origin `host_permissions`; CWS MV3 program policy
    on single-purpose + permission justification. [Verified]
  - Touches: `docs/cws-submission-checklist.md`, a new "permissions rationale"
    doc section; manifest unchanged.
  - Acceptance: each requested permission and host origin has a one-line, copy-
    paste store justification, and the single-purpose statement explains why the
    feature set is one product, not a toolbar.
  - Verify: checklist review against the published CWS field requirements.
  - Complexity: S
- [ ] P2 — Document the yt-dlp cookie-handling threat model for the companion
  - Why: the downloader uses the `cookies` permission and yt-dlp; yt-dlp has a
    documented cookie-leak advisory class (cookies leaking across hosts on
    redirect, CVE-2023-35934) and Chrome's July-2024 cookie encryption changed
    the `--cookies-from-browser` story. There is no written threat model stating
    which cookie path the companion uses and why it is safe.
  - Evidence: `astra_downloader/` uses yt-dlp; manifest `cookies` permission +
    `EXT_COOKIE_LIST` message in `docs/architecture.md`; yt-dlp cookie-leak CVE
    history. [Verified]
  - Touches: `HARDENING.md` or `docs/` threat-model note; no code change.
  - Acceptance: a note records how cookies reach yt-dlp, the host-scoping
    guarantee, and the minimum pinned yt-dlp version that fixes the leak class.
  - Verify: cross-check the documented floor against the pin in
    `astra_downloader/requirements.txt`.
  - Complexity: S
- [ ] P2 — Disclose Return-YouTube-Dislike estimate accuracy in the UI
  - Why: the archived risk list already notes "RYD accuracy: dislike counts for
    post-2021 and low-traffic videos are estimates. UI must disclose this," but
    there is no roadmap item to actually surface the disclosure. Competitors that
    show raw counts without a caveat draw user mistrust.
  - Evidence: archived dossier "Risks and Open Questions"; `returnyoutubedislikeapi.com`
    host permission in `extension/manifest.json`. [Verified]
  - Touches: the dislike-count render path, a tooltip/aria-description string,
    locale bundles.
  - Acceptance: estimated counts carry a discoverable "estimate" affordance with
    an accessible name; exact counts (where available) do not.
  - Verify: render a known low-traffic video and confirm the affordance + its
    `aria-label`.
  - Complexity: S

### Larger Bets

- [ ] P0 — Standing migration test for the 354-key settings schema across versions
  - Why: settings are 354 flat keys with `unlimitedStorage`; a botched
    add/rename/remove silently drops or corrupts user config on upgrade. A
    round-trip test exists (`settings-migration-roundtrip.test.js`) but there is
    no test that loads a *pinned old-version settings blob* and asserts a clean,
    lossless migration forward — the highest data-loss risk in the product.
  - Evidence: `extension/default-settings.json` (354 keys);
    `tests/settings-migration-roundtrip.test.js`;
    `scripts/check-settings.js`; `unlimitedStorage` permission. [Verified]
  - Touches: `tests/`, a `tests/fixtures/` pinned legacy-settings blob,
    `extension/core/storage-manager.js`.
  - Acceptance: a test loads a frozen prior-version settings object and asserts
    every key is preserved, defaulted, or intentionally renamed — never dropped;
    a deliberately-removed key turns the test red.
  - Verify: `npm test` includes the migration fixture and fails on a simulated
    drop.
  - Complexity: M
- [ ] P1 — Settings import/export with schema-validated round-trip and scrub
  - Why: power users moving across browsers (a real PocketTube differentiator is
    Google-Drive/Chrome-profile sync) need an explicit, local-first
    export/import. Today there is no first-class backup surface, and any export
    must run through `policy-profile.js` scrubbing so AI keys / credential-bearing
    fields never leave the machine.
  - Evidence: PocketTube cross-device sync as the competitive baseline;
    `extension/core/policy-profile.js` scrub helpers; `aiSummaryEndpoint` /
    credential-bearing schema keys; no export action in `extension/popup.js`. [Verified]
  - Touches: `extension/popup.js`, `extension/popup.html`,
    `extension/core/policy-profile.js`, `extension/core/storage-manager.js`.
  - Acceptance: export produces a scrubbed JSON file; import validates against the
    schema, rejects unknown/shape-mismatched keys, and round-trips losslessly; a
    test asserts a credential field is never present in an export.
  - Verify: export → wipe → import on a populated profile restores all
    non-credential settings; `node scripts/check-settings.js` passes the export.
  - Complexity: L
- [ ] P1 — Cross-browser parity gate: Firefox MV3 smoke before each AMO submission
  - Why: Enhancer for YouTube's Firefox build has suffered extended non-functional
    periods — the clearest competitive opening is reliable Firefox parity. The
    repo patches the manifest for Gecko (`scripts/manifest-patch.js`) but nothing
    exercises the Firefox build; MV3 `scripting.executeScript` and service-worker
    behavior diverge from Chromium.
  - Evidence: `scripts/manifest-patch.js` `browser_specific_settings.gecko`;
    `extension/background.js` service worker; Enhancer-for-YouTube Firefox
    reliability reports; the existing Firefox-149 audit item under Existing
    Planned Work (this complements, does not duplicate, it). [Verified]
  - Touches: `.github/workflows/`, `scripts/manifest-patch.js`, a Firefox smoke
    harness (e.g. `web-ext lint` + headless load).
  - Acceptance: CI runs `web-ext lint` (or equivalent) on the patched Firefox
    manifest and fails on a Gecko-incompatible manifest/API change.
  - Verify: a deliberately Chromium-only manifest key turns the Firefox gate red.
  - Complexity: M
- [ ] P2 — First-run onboarding + empty/permission states for the companion path
  - Why: the popup is the only settings surface and the downloader is a separate
    PyInstaller companion on `127.0.0.1`. A new user has no guided path to install
    the companion, grant permissions, or understand the store-safe vs GitHub-full
    split; the connection simply fails silently until the companion is running.
  - Evidence: `docs/architecture.md` (popup is the only surface; companion on
    9751 + 5 fallback ports); no onboarding flow in `extension/popup.js`;
    `policy-profile.js` store-safe/github-full split. [Verified]
  - Touches: `extension/popup.html`, `extension/popup.js`, `extension/popup.css`,
    locale bundles.
  - Acceptance: a first-run state explains the companion, shows a clear
    "companion not detected" empty/error state with a download link, and never
    fails silently; the flow is keyboard-and-screen-reader reachable.
  - Verify: load the popup with no companion running and confirm the guided empty
    state + its accessible names.
  - Complexity: L
- [ ] P2 — WCAG 2.2 AA audit pass for in-page overlays (beyond the popup)
  - Why: `audit:a11y` and `audit:contrast` gate the popup, but the in-page
    overlays (theater split, transcript, notes, subscription manager, toasts) are
    not under an automated a11y gate. WCAG 2.2 AA adds focus-appearance and
    target-size criteria that overlay controls commonly fail.
  - Evidence: `scripts/audit-popup-a11y.js` scope is the popup only; in-page
    overlays render from `extension/ytkit.js` / `features/*`;
    `docs/screen-reader-smoke.md` exists but is manual. [Verified]
  - Touches: `scripts/`, `tests/`, overlay render paths in `features/*`.
  - Acceptance: an automated check asserts overlay controls have accessible
    names, focus order, ≥24px targets, and visible focus; a regression turns it
    red.
  - Verify: run the new audit against a rendered overlay fixture.
  - Complexity: L
- [ ] P3 — Diagnostics export bundle for bug reports
  - Why: `core/diagnostic-log.js` and `selector-health.js` already collect
    runtime signal, but there is no one-click "export diagnostics" that a user can
    attach to a GitHub issue — selector rot is the top carried risk and repro.
    data is currently trapped in the console.
  - Evidence: `extension/core/diagnostic-log.js`,
    `extension/core/selector-health.js`, the `feature_request` template already
    asks for risk/parity profile. [Verified]
  - Touches: `extension/popup.js`, `extension/core/diagnostic-log.js`,
    `extension/core/policy-profile.js` (scrub before export).
  - Acceptance: a popup action exports a scrubbed diagnostics bundle (selector
    health, version surfaces, enabled features) with no credentials or PII.
  - Verify: export on a populated profile and confirm no credential/host-cookie
    data is present.
  - Complexity: M
