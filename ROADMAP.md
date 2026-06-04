# Astra Deck Roadmap

> Single source of truth for all planned work. Items above the `---` are existing
> plans; items below are research conducted 2026-06-03.

Shipped work is summarized in [COMPLETED.md](COMPLETED.md) and detailed in
[CHANGELOG.md](CHANGELOG.md). Research is summarized in
[RESEARCH_REPORT.md](RESEARCH_REPORT.md). The pre-consolidation research plans
are archived under `docs/archive/research/`, and the legacy
internal-planning-track dossier labelled v5.2.0 -> v6.0.0 (competitive matrix, feature catalog,
technical reconnaissance, phased feature plan) is preserved at
[docs/archive/roadmap-dossier-2026-05-21.md](docs/archive/roadmap-dossier-2026-05-21.md).
Current shipped product-version sources remain on the v4.x line; at this
cleanup they agree at v4.46.0.

> Last researched: Cycle 24 - 2026-06-04.

## ▶ Implementer Instructions (for the build machine)

This roadmap is fed continuously by an automated research machine. On every
pass, the implementing machine should:

1. `git pull --rebase` to get the latest researched items before starting.
2. Work the open 🤖 items top-down by priority (P0 -> P3). Build them properly:
   multi-file structure, real error handling, no runtime auto-install hacks,
   version strings synced, docs/CHANGELOG updated in the same commit.
3. In ADDITION to building items, run a FULL UX AUDIT each pass -- do not skip
   it even when the queue is full. Walk every screen / page / dialog / form /
   table / empty-loading-error-disabled state across light/dark/high-contrast
   themes. Check: onboarding, navigation clarity, spacing/contrast/alignment,
   clipping/overflow, hierarchy, microcopy, destructive-action guards,
   keyboard + screen-reader accessibility, and trust signals. Fix what you
   find, or file it back as a new 🤖 roadmap item if it is larger than a pass.
4. Check off ✅ each item you complete (leave it in place with the checkmark),
   commit per logical change with a "why" message, and push.
5. Never edit this Implementer Instructions block or the 🔬 Researcher Queue
   headings -- the research machine owns those. Never force-push.
6. Use the existing Node 22 gate as the verification floor:
   `npm run check`, `npm test`, `npm run build`, `node sync-userscript.js`, and
   targeted Python downloader tests for companion changes.
7. Preserve the profile split: store-safe artifacts must keep AI, Cobalt, and
   loopback grants stripped while GitHub-full keeps the complete data-flow
   catalogue.

Researcher-queue ownership tags: `🤖` means implementer-actionable, `🔧` means
user/external/manual gated, `🔬` means researcher-added this cycle, and `✅`
means implemented/closed by the build lane.

## Existing Planned Work

### Browser-Bounded Captures

- [x] P0 — Capture YouTube liquid-glass player chrome (HARDENING H21, EI9)
  - Why: the watch-page player redesign (`.ytp-delhi-modern`, action pills,
    overflow panels, bottom controls) is high-churn; large player UI work needs
    a fresh capture-backed selector set.
  - Touches: `mhtml/`, `extension/core/selector-packs/`, critical selector set.
  - Acceptance: the watch-page fixture is refreshed and liquid-glass selectors
    are promoted into the critical selector set. _(Delivered 2026-06-04:
    `scripts/capture-watch-mhtml.js` added a stopped-loading Chrome Stable CDP
    capture path after plain `Page.captureSnapshot` timed out at 70s. The
    refreshed local `mhtml/WatchPage.mhtml` from `jNQXAC9IVRw` regenerated
    `tests/fixtures/yt-watch.tokens.txt` and
    `tests/fixtures/selector-surface-matches.json`; the fixture now proves
    `ytp-delhi-modern`, `ytp-overflow-panel`, and `ytp-time-wrapper-delhi`.
    `ytp-action-pill` / `ytp-actions-container` remain unmatched fallback
    watchlist entries for rollout variants not present in this capture.)_
  - Source: ROADMAP.md Active Backlog (Browser-Bounded Captures)
- [ ] P2 — MHTML capture-week expansion (EI15 + NF19)
  - Why: Shorts, channel, search, history, watch-later, embedded player, and
    notifications surfaces have no capture-backed fixtures, leaving their
    selector packs unverified against real DOM.
  - Evidence: `scripts/build-selector-fixtures.js` currently registers only
    `YouTube.mhtml`, `WatchPage.mhtml`, and `LiveChat.mhtml`, and
    `selector-surface-matches.json` only exercises `playerChrome` and
    `liveChat`. High-churn packs such as `notifications`, `search`,
    `shortsShelf`, `feedCard`, `thumbnail`, and `profile` still carry
    2026-05-19 verification stamps or cite captures not represented in the
    committed fixture builder. [Verified]
  - Capture matrix:
    - `mhtml/Shorts.mhtml` -> `shortsShelf`, `media`, `thumbnail`.
    - `mhtml/SearchResults.mhtml` -> `search`, `feedCard`, `thumbnail`, `nav`.
    - `mhtml/Channel.mhtml` -> `profile` / `channelProfile`, `feed`,
      `feedCard`, `thumbnail`.
    - `mhtml/History.mhtml` -> `feed`, `feedCard`, `thumbnail`, `appShell`.
    - `mhtml/WatchLater.mhtml` -> `feed`, `feedCard`, `thumbnail`, `leftNav`.
    - `mhtml/EmbedPlayer.mhtml` -> `player`, `mainVideo`, `playerChrome`,
      `playerSettings`.
    - `mhtml/NotificationsMenu.mhtml` -> `notifications`, `nav`, `appShell`.
  - Touches: `mhtml/`, `tests/fixtures/*.tokens.txt`,
    `tests/fixtures/selector-surface-matches.json`,
    `scripts/build-selector-fixtures.js`, `tests/selector-regression.test.js`,
    `docs/selector-fixture-workflow.md`, affected selector-pack metadata.
  - Acceptance: the fixture builder registers every matrix capture, emits a
    committed token file per capture, extends `SURFACE_MATCH_SOURCES` to the
    high-churn packs above, and fails the selector test when a stable selector
    from any registered surface is unmatched. Raw `.mhtml` files remain
    gitignored; only derived fixtures and metadata are committed.
  - Verify: `npm run build:fixtures`,
    `node --test tests/selector-regression.test.js`, then inspect
    `tests/fixtures/selector-surface-matches.json` for zero unmatched stable
    selectors. If a capture is blocked by auth or YouTube rollout state, record
    the surface-specific blocker in `docs/selector-fixture-workflow.md`.
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
- [x] P3 — Group notifications digest panel
  - Why: users want per-group new-video awareness without opening every group.
  - Touches: subscription-groups feature module, popup/overlay UI.
  - Acceptance: a panel shows per-group new-video counts since last visit.
    _(Delivered 2026-06-04: the Subscription Groups toolbar now exposes a
    Digest panel with all-subscriptions and per-group rendered-video/new-video
    counts, child-group row styling, relative-age based new-since detection, and
    bounded mark-read updates through `subscriptionLastVisitData`.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [x] P3 — Study/work mode export to Markdown/CSV
  - Why: research-mode users want to export tracked time / focused history.
  - Touches: study/work-mode feature, export helpers.
  - Acceptance: study/work mode data exports to Markdown and CSV. _(Delivered
    2026-06-04: `researchSpacedReview` now exports a Study / Work report as
    Markdown or CSV, including Watch Time Tracker totals, current Digital
    Wellbeing day state, Focused Mode state, and timestamp bookmarks with deep
    links. The exporter now reads the live bookmark `t`/`n` fields and the
    shared file-export helper accepts per-format MIME types.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [x] P3 — i18n feature-definition labels out of `ytkit.js` (EI6)
  - Why: feature-definition labels are inline English in the monolith, blocking
    real localization depth.
  - Touches: `extension/ytkit.js`, locale bundles, `_locales/`.
  - Acceptance: feature-definition labels resolve through the i18n layer instead
    of inline English strings. _(Delivered 2026-06-04: feature definitions now
    receive generated `feature_<id>_name` / `feature_<id>_desc` metadata keys,
    the settings panel and page quick-control cards resolve labels through the
    existing locale override -> `chrome.i18n.getMessage()` -> English fallback
    path, the runtime registry carries the feature i18n metadata, and all 10
    locale bundles include the seeded feature keys with quick-toggle
    translations reused where they already existed.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)
- [x] P3 — Store-safe vs GitHub-full separate build artifacts
  - Why: download / ad-skip / Cobalt features may require GitHub-full only; a
    single artifact risks store-policy rejection.
  - Touches: `build-extension.js`, policy-profile, release packaging.
  - Acceptance: store-safe and GitHub-full artifacts are generated separately
    from one source of truth. _(Delivered 2026-06-04: `build-extension.js`
    now derives store-safe and GitHub-full manifest host grants / CSP from the
    data-flow catalogue, emits profile-named Chrome and Firefox artifacts by
    default, supports `--profile store-safe|github-full|both`, and the
    GitHub-full manifest/proxy path now includes Cobalt while the store-safe
    build strips AI, Cobalt, and local-loopback hosts.)_
  - Source: ROADMAP.md Active Backlog (Companion, Subscriptions, And Research)

### Hardening And Cross-Browser

> Triaged out of the local 2026-04-24 factory-loop research pass (NEXT tier) and
> confirmed still-actionable against current code; the already-shipped NOW/NEXT
> items from that pass are recorded in `COMPLETED.md`.

- [x] P2 — Monthly yt-dlp version-bump + smoke-test CI (research NEXT-1)
  - Why: yt-dlp is the highest-churn dependency; silent extractor breakage ships
    a non-functional downloader. Dependabot opens dependency PRs but there is no
    automated download smoke test to gate a yt-dlp bump.
  - Touches: `.github/workflows/`, `astra_downloader/requirements.txt`.
  - Acceptance: a scheduled/`workflow_dispatch` job installs the pinned yt-dlp,
    runs a minimal extract/download against a known stable video, and turns red
    on a deliberately-broken pin. _(Delivered 2026-06-04: downloader
    requirements now exact-pin `yt-dlp==2026.3.17` and `curl_cffi==0.15.0`,
    `.github/workflows/yt-dlp-smoke.yml` runs monthly and on
    `workflow_dispatch`, and `scripts/yt-dlp-smoke.py` performs a bounded real
    media download against a stable YouTube fixture with static tests pinning
    the workflow and script invariants.)_
  - Source: docs/archive/research/ (iter-1-scored NEXT-1), PHASE-2-5-SUMMARY
- [x] P2 — Selector-resilience test harness over `mhtml/` fixtures (research NEXT-5)
  - Why: runtime DOM churn is the top carried risk; a fixture-backed harness
    catches selector rot before users do.
  - Touches: `scripts/build-selector-fixtures.js`, `tests/`, `mhtml/`.
  - Acceptance: a test fails when a critical selector no longer matches its
    captured fixture; coverage spans the live-chat and liquid-glass packs.
    _(Delivered 2026-06-04: `npm run build:fixtures` now emits
    `tests/fixtures/selector-surface-matches.json` by parsing decoded MHTML
    markup through a small DOM subset matcher. `tests/selector-regression.test.js`
    now verifies the report stays synced to the `playerChrome` and `liveChat`
    selector-pack chains and fails when the critical live-chat or liquid-glass
    selectors no longer resolve against their captured fixture.)_
  - Source: docs/archive/research/ (iter-1-scored NEXT-5)
- [x] P2 — Firefox 149 pre-flight `scripting.executeScript` audit (research NEXT-6)
  - Why: Firefox MV3 `scripting.executeScript` has diverged from Chromium; a
    pre-flight catches injection-target breakage cheaply before AMO submission.
  - Touches: `extension/background.js`, `extension/*.js`, `docs/`.
  - Acceptance: an audit note records Firefox-Nightly behavior of every
    `executeScript` call site; any `moz-extension://` divergence is filed.
    _(Delivered 2026-06-04: `docs/firefox-executescript-preflight.md` records
    the Firefox 149/152 behavior and the current zero-call-site inventory.
    `scripts/check-firefox-injection.js` scans `extension/` for
    `scripting.executeScript`, `tabs.executeScript`, and dynamic content-script
    registration APIs, is wired into `npm run check`, and will fail future
    additions until their targets are audited.)_
  - Source: docs/archive/research/ (iter-1-scored NEXT-6, borderline NOW)
- [x] P2 — Allowlist yt-dlp flags at the Flask boundary (research, deferred)
  - Why: complements the yt-dlp pin; makes the no-passthrough invariant explicit
    and enforced rather than incidental, so a future feature cannot widen the
    surface unintentionally.
  - Touches: `astra_downloader/astra_downloader.py`.
  - Acceptance: yt-dlp invocation rejects any flag outside a reviewed allowlist;
    a test asserts an unexpected flag is refused.
  - Status 2026-06-04: delivered. `/download` now accepts only reviewed
    extension wire fields before Deno checks, cookie writes, queueing, or
    subprocess setup. Client-supplied yt-dlp argv/flag fields and unknown fields
    return explicit 400 responses, and Python API tests cover helper validation
    plus endpoint rejection before a download record is queued.
  - Source: docs/archive/research/ (iter-1-scored under-consideration / NEXT)

### Carried Risks And Open Questions

- [x] P2 — Bound storage growth for `videoNotes`, `timestampBookmarks`, and `videoHistory` (R4)
  - Why: unbounded local-storage maps are a long-session memory / quota risk.
  - Touches: storage-manager, the affected feature modules.
  - Acceptance: each map enforces a documented cap with deterministic eviction.
  - Status 2026-06-04: delivered. `videoNotesData` keeps the existing 1000-note
    LRU and is now also swept by `storageQuotaLRU`; `ytkit-bookmarks`
    (`timestampBookmarks`) is capped at 400 videos / 100 bookmarks per video by
    newest edit time; `ytkit-watch-progress` (the live video-history/progress
    map) is capped at 2000 videos and 30 days; `ytkit-watch-time` is capped to
    the latest 90 day keys. Extension and userscript write paths enforce the
    caps before persistence, and hardening/userscript parity tests pin the real
    stores instead of the stale `timestampBookmarks` toggle.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)
- [x] P3 — Finish `policy-profile.js` scrub-regex coverage (R6)
  - Why: incomplete scrub-regex coverage risks leaking gated values into
    store-safe / export profiles.
  - Touches: `extension/core/policy-profile.js`, scrub tests.
  - Acceptance: scrub-regex coverage spans all gated keys with tests.
  - Status 2026-06-04: delivered. The scrubber now uses separator-aware
    `api[_-]?key` matching, keeps `apiKeyId`-style identifiers out of the
    scrub set, and also catches password, credential, private/access/refresh/
    session/signing key, cookie, bearer, secret, token, and auth-shaped keys.
    Unknown secret-shaped keys are removed before forward-compatible passthrough.
    Hardening tests now derive coverage from the live `SETTINGS_SCHEMA`: every
    GitHub-full schema entry is defaulted in store-safe exports unless scrubbed,
    and every credential-shaped schema key is absent from both store-safe and
    GitHub-full export snapshots.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)
- [x] P3 — Surface a Cobalt fallback unreachable diagnostic (R8)
  - Why: when the Cobalt fallback is unreachable the failure is currently silent.
  - Touches: downloader fallback path, diagnostic-log.
  - Acceptance: an unreachable Cobalt instance produces an actionable local
    diagnostic.
  - Status 2026-06-04: delivered. `downloadCobaltFallback` now records a
    `DiagnosticLog` entry with ctx `cobalt-fallback` whenever the Cobalt request
    fails after Astra Downloader is confirmed offline. The diagnostic uses only
    the configured instance origin, explains that the local downloader was
    offline, and points users to `downloadCobaltInstance` or starting Astra
    Downloader. A hardening test pins the origin-only formatter and remediation
    text.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)
- [x] P3 — Add a long-session memory-leak test (G3)
  - Why: rich grid cards recycle aggressively; observer/diagnostic growth needs a
    standing regression guard.
  - Touches: `tests/`.
  - Acceptance: a long-session test shows bounded observer work and no unbounded
    diagnostics maps.
  - Status 2026-06-04: delivered. `tests/long-session.test.js` now loads the
    real `core/navigation.js` and `core/diagnostic-log.js` modules in a stubbed
    DOM/timer/RAF/MutationObserver harness, simulates 1000 route changes and
    mutation batches, asserts the shared observer count stays flat, scoped rules
    only run for matching rich-grid card additions, the diagnostic ring and
    per-context counter map stay capped, and all route listeners / observers
    disconnect after cleanup.
  - Source: ROADMAP.md Active Backlog (Carried Risks And Questions)

> Open decisions carried forward: downloader signing budget, CWS/AMO submission
> intent, real-browser QA for dead-channel staging at large feed scale,
> lifecycle migration cadence, live-chat capture window, and i18n coverage
> warning policy.

---

## Research-Driven Additions

### Researcher Queue (Cycle 24 - 2026-06-04)

- [x] 🔬 `retired-options-page-copy-2026-06-04` - inspected the retired
  options-page contract, manifest settings surface, runtime summary-provider
  error path, README settings-panel guidance, hardening tests, shipped extension
  files, and Chrome / Mozilla / accessibility guidance for extension UI and
  actionable error copy. Detailed notes live in
  `docs/research-cycle-24-retired-options-copy.md`.
- [ ] P2 - 🔬🤖 Replace retired options-page runtime copy with current settings-panel guidance
  - Why: the standalone options page was removed in v3.19.0 and the toolbar
    popup/full settings panel are now the supported settings paths, but the
    summary-provider key error still tells users to set `aiSummaryApiKey` via an
    options page that does not ship.
  - Evidence: `extension/ytkit.js:28979-28982` throws `Set aiSummaryApiKey
    first (via options page)`; `extension/manifest.json:15-18` declares
    `action.default_popup = "popup.html"`; the manifest has no `options_ui`;
    `Get-ChildItem extension -File` shows no `options.html` or `options.js`;
    `tests/hardening.test.js:536-550` asserts the standalone options page stays
    removed; `README.md:241-252` points users to the YouTube gear icon or the
    toolbar popup `Open Full Settings` action; and `docs/architecture.md:10`
    says the toolbar popup is the only extension surface for settings
    management. [Verified]
  - Touches: `extension/ytkit.js`, synced `YTKit.user.js`, and
    `tests/hardening.test.js` or another targeted copy-regression test.
  - Acceptance: the key-missing error points to the real in-page settings panel
    or toolbar popup `Open Full Settings` action; no shipped runtime string tells
    users to use an options page; the userscript bundle is synced after the
    source change; a regression test fails if `via options page` or equivalent
    retired runtime copy returns; historical comments/docs may keep clearly
    historical options-page references.
  - Verify: `rg -n "via options page|options page" extension/ytkit.js
    YTKit.user.js extension/_locales`; `node sync-userscript.js`;
    `npm run check`; `npm test`; manual or screenshot QA on the summary feature
    missing-key path confirms the copy names an existing settings path.
  - Complexity: S

### Researcher Queue (Cycle 23 - 2026-06-04)

- [x] 🔬 `repo-working-notes-drift-2026-06-04` - inspected the repo-local
  instruction chain, `CLAUDE.md` current/historical sections, release policy,
  Firefox support claims, signing-key release checklist, architecture map, CWS
  / AMO checklist, manifest patch, current branch-protection behavior, and
  official GitHub / Mozilla / Chrome guidance. Detailed notes live in
  `docs/research-cycle-23-repo-working-notes-drift.md`.
- [ ] P2 - 🔬🤖 Reconcile repo-local working notes with current release and browser-support contracts
  - Why: future repo work starts from `AGENTS.md`, which delegates to
    `CLAUDE.md`; that file now references a missing handoff log, includes stale
    Firefox 128+ statements, and describes direct `main` push / `gh release
    create` release flow even though protected `main`, local `ytkit.pem`
    signing, profile-split release artifacts, and Firefox 140+ data-consent
    requirements are the current contract.
  - Evidence: `AGENTS.md:1-7` delegates repo working notes to `CLAUDE.md`;
    `CLAUDE.md:3-4` points at `CODEX-CHANGELOG.md`, while `Test-Path
    CODEX-CHANGELOG.md` returns `False`; `CLAUDE.md:68-76` says to push `main`,
    run `gh release create`, and require Firefox 128+; `CLAUDE.md:382-385`,
    `:706-708`, and `:884-889` present old five-artifact / v3.20.x state in
    historical sections; and `CLAUDE.md:432-435` repeats
    `strict_min_version: 128.0`. Current sources instead say Firefox 140+ and
    maintainer-local release publication: `scripts/manifest-patch.js:7` and
    `:18-24`, `README.md:49` and `:342-344`, `docs/architecture.md:7`,
    `docs/cws-submission-checklist.md:170-174`, and
    `docs/signing-keys.md:185-193` / `:198-215`. `docs/architecture.md:127`
    still has related release-flow drift already covered by Cycle 14. [Verified]
  - Touches: `CLAUDE.md`, possibly `docs/architecture.md`,
    `docs/signing-keys.md`, `README.md`, `CONTRIBUTING.md`, and an optional
    docs-drift check if the implementer wants one.
  - Acceptance: the missing handoff-log pointer is removed, replaced with an
    existing tracked file, or backed by a real tracked log; current release
    instructions describe branch/PR publication for protected `main`, local
    `ytkit.pem` signing, eight profile-split extension artifacts, userscript,
    SBOM, manifest/checksum assets, and the separate companion EXE release item;
    every current browser-support statement says Firefox 140+ for extension
    artifacts and references `scripts/manifest-patch.js` data-consent behavior;
    old v3/v4 release summaries are clearly marked as historical or moved under
    an archive-style section so they cannot be mistaken for current state; the
    Cycle 14 release-doc item is either updated or cross-linked so
    `docs/architecture.md` no longer contradicts the signing-key release policy.
  - Verify: `Test-Path CODEX-CHANGELOG.md` is true only if the file is meant to
    exist, otherwise `rg -n "CODEX-CHANGELOG" CLAUDE.md AGENTS.md docs README.md`
    returns no stale pointer; `rg -n "strict_min_version: \"128\\.0\"|requires
    Firefox 128|Firefox 128\\+" CLAUDE.md README.md docs` returns no current
    contract statements; `rg -n "push main|gh release create|All 5 artifacts"
    CLAUDE.md docs README.md` returns only historical sections or no matches;
    `node scripts/check-versions.js`; and docs-only diff review confirms no
    feature source or generated artifact changed unless a docs-drift check was
    deliberately added.
  - Complexity: S/M

### Researcher Queue (Cycle 22 - 2026-06-04)

- [x] 🔬 `companion-update-release-channel-2026-06-04` - inspected the live
  latest GitHub Release, companion `/update` source/version contract,
  PyInstaller output path, release-manifest sidecar generation, release
  workflow, local release checklist, Cycle 8 integrity notes, and external
  release/update-security guidance. Detailed notes live in
  `docs/research-cycle-22-companion-update-assets.md`.
- [ ] P1 - 🔬🤖🔧 Prove the Astra Downloader self-update release-channel contract
  - Why: `/update` now compares the companion's local `APP_VERSION` to the raw
    `main` source and downloads `AstraDownloader.exe` from the latest GitHub
    Release, but the current latest public release `v4.46.0` does not include
    `AstraDownloader.exe` or `AstraDownloader.exe.sha256`. A future source
    version bump can therefore advertise an update before the release channel can
    serve or verify the payload.
  - Evidence: `astra_downloader/astra_downloader.py:94` keeps `APP_VERSION =
    "1.5.1"`; `astra_downloader/astra_downloader.py:128-130` points update
    checks at raw `main` and `/releases/latest/download/AstraDownloader.exe` /
    `.sha256`; `astra_downloader/astra_downloader.py:432-441` treats the
    sidecar as best effort; `astra_downloader/astra_downloader.py:1296-1339`
    proceeds after MZ/size validation when the sidecar is unavailable; and
    `astra_downloader/astra_downloader.py:3177-3185` exposes `/update`.
    `scripts/generate-release-manifest.js:10` reads `build/`,
    `scripts/generate-release-manifest.js:72-89` knows the EXE/sidecar names,
    `scripts/generate-release-manifest.js:101-112` does not require them, and
    `scripts/generate-release-manifest.js:134-139` emits the sidecar only when
    `build/AstraDownloader.exe` exists. `astra_downloader/build.py:3-4`, `:31`,
    and `:96-99` output the PyInstaller EXE to the repo root instead of
    `build/`; `.github/workflows/build.yml:16` and `:38-47` build/upload only
    `build/*` on Ubuntu; `docs/signing-keys.md:198-216` has no companion EXE
    staging step; and `docs/research-cycle-8-ci-release-integrity.md:118`,
    `:202-203`, and `:280-281` already marked the companion sidecar/release
    shape partial. [Verified]
  - Touches: `astra_downloader/build.py` or a companion staging script,
    `scripts/generate-release-manifest.js`, `docs/signing-keys.md`,
    `.github/workflows/build.yml` if a Windows CI job is chosen,
    `astra_downloader/astra_downloader.py`, and
    `astra_downloader/test_astra_downloader.py`.
  - Acceptance: a documented local or CI-safe path stages
    `AstraDownloader.exe` in `build/` before `npm run release:manifest`;
    `scripts/generate-release-manifest.js` emits `AstraDownloader.exe.sha256`
    and includes the EXE/sidecar in `release-manifest.json` and `SHA256SUMS`
    whenever the EXE is present; release docs state whether the companion EXE
    attaches to the same product release or a separate companion release, and
    how `APP_VERSION` relates to the selected release tag/source; `APP_VERSION`
    is not bumped above the deployed version until the intended update release
    contains both assets; release-channel self-update fails clearly when the
    sidecar is missing after update-channel activation, or docs explain the
    residual risk if optional hash behavior is intentionally retained; tests
    cover missing asset, missing sidecar, generated sidecar, manifest inclusion,
    and successful hash verification; a live dry-run downloads the EXE/sidecar
    and compares hashes. The signed MSI row remains open unless signing is also
    funded and shipped.
  - Verify: `py -3.12 astra_downloader/build.py`; stage the EXE into `build/`
    by the new documented path; `npm run release:manifest`; `Get-FileHash
    build\AstraDownloader.exe -Algorithm SHA256`; `Get-Content
    build\AstraDownloader.exe.sha256`; inspect `build\release-manifest.json`
    and `build\SHA256SUMS`; `py -3.12 -m pytest
    astra_downloader/test_astra_downloader.py -q`; for the release dry-run,
    `gh release view <tag> --json assets`, `gh release download <tag> -p
    AstraDownloader.exe -p AstraDownloader.exe.sha256`, and a local hash
    comparison.
  - Complexity: M

### Researcher Queue (Cycle 21 - 2026-06-04)

- [x] 🔬 `codeowners-security-review-2026-06-04` - inspected supported
  CODEOWNERS locations, branch pull-request review policy, existing PR
  template, security-sensitive path set, and GitHub CODEOWNERS / protected
  branch documentation. Detailed notes live in
  `docs/research-cycle-21-codeowners.md`.
- [ ] 🔬🤖🔧 P2 — Add CODEOWNERS coverage for security-sensitive paths
  - Why: `main` already requires pull-request review, but no CODEOWNERS file
    exists and branch protection does not require code-owner review. Changes to
    workflows, release tooling, signing-key policy, extension permissions,
    background proxy/message surfaces, companion loopback code, security policy,
    or repository settings docs therefore do not automatically request or
    require a focused maintainer/security review. That leaves the new security
    roadmap items dependent on manual reviewer memory instead of path-based
    ownership.
  - Evidence: `Test-Path .github/CODEOWNERS`, `Test-Path CODEOWNERS`, and
    `Test-Path docs/CODEOWNERS` all return `False`; `rg -n "CODEOWNERS|code
    owner|require_code_owner_reviews" .github docs ROADMAP.md RESEARCH_REPORT.md
    README.md CONTRIBUTING.md` finds no current ownership policy. `gh repo
    view SysAdminDoc/Astra-Deck --json owner,viewerPermission` confirms
    `@SysAdminDoc` owns the personal public repository and the current viewer
    has `ADMIN` permission. `gh api
    repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews
    --jq .` reports `required_approving_review_count: 1` but
    `require_code_owner_reviews: false`; `gh api
    repos/SysAdminDoc/Astra-Deck/codeowners/errors` returns `404` while no
    CODEOWNERS file exists. GitHub docs say CODEOWNERS files can live in
    `.github/`, root, or `docs/`, define responsible people or teams with write
    access, request reviews when owned files change, and can be combined with
    branch protection to require code-owner approval. [Verified]
  - Touches: `.github/CODEOWNERS`, `docs/repo-settings.md`, branch protection
    `require_code_owner_reviews`, and likely owner mappings for `.github/`,
    `build-extension.js`, `scripts/generate-release-manifest.js`,
    `docs/signing-keys.md`, `SECURITY.md`, `extension/manifest.json`,
    `extension/background.js`, `extension/core/data-flow.js`,
    `extension/core/policy-profile.js`, and `astra_downloader/`.
  - Acceptance: `.github/CODEOWNERS` exists on `main`, maps security-sensitive
    files and directories to `@SysAdminDoc` or a real write-enabled team, and
    includes comments explaining why the paths are protected. The CODEOWNERS
    errors API reports no invalid pattern/owner entries for the default branch.
    Branch protection enables code-owner review after the file is present. The
    PR template or repo-settings doc tells contributors that security-sensitive
    path changes require owner review. Any path owner listed has write access,
    and generated or archived docs are not over-owned unless they affect
    release/security policy.
  - Verify: `gh api repos/SysAdminDoc/Astra-Deck/contents/.github/CODEOWNERS
    --jq .path` returns `.github/CODEOWNERS`; `gh api
    repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq ".errors"` returns an
    empty list; `gh api
    repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews
    --jq "{required_approving_review_count,require_code_owner_reviews}"` shows
    code-owner reviews enabled. A test PR touching `.github/workflows/validate.yml`
    or `build-extension.js` requests the expected owner and cannot merge until
    an owner approval is present.
  - Complexity: S

### Researcher Queue (Cycle 20 - 2026-06-04)

- [x] 🔬 `runtime-optional-enrichment-hosts-2026-06-04` - inspected the
  store-safe/GitHub-full manifest builder, data-flow catalogue, permission
  rationale, CWS checklist, current hardening assertions, and Chrome/Mozilla
  optional host-permission guidance. Detailed notes live in
  `docs/research-cycle-20-optional-permissions.md`.
- [ ] P2 - 🔬🤖 Convert optional enrichment hosts to runtime-granted host permissions
  - Why: Astra Deck's public store-safe build now strips AI, Cobalt, Ollama,
    and local companion hosts, but it still grants optional enrichment API hosts
    at install time. SponsorBlock/DeArrow, Return YouTube Dislike, Reddit
    comments, and thumbnail upgrade/download features can be framed as explicit
    user-enabled capabilities, so moving their non-core hosts to runtime grants
    would reduce install-time warnings, align access with toggles, and improve
    denied/revoked state handling before store submission.
  - Evidence: `extension/manifest.json:31` defines install-time
    `host_permissions`, with `extension/manifest.json:35` through
    `extension/manifest.json:39` granting `i.ytimg.com`,
    `sponsor.ajay.app`, `returnyoutubedislikeapi.com`, `www.reddit.com`, and
    `old.reddit.com`. `build-extension.js:258` through
    `build-extension.js:287` append every allowed `ORIGIN_CATALOGUE` entry into
    profile `host_permissions` and derive CSP from that list; no generated
    `optional_host_permissions` path exists. `extension/core/data-flow.js:46`,
    `extension/core/data-flow.js:54`, `extension/core/data-flow.js:62`, and
    `extension/core/data-flow.js:70` tie those hosts to discrete feature keys.
    `docs/cws-submission-checklist.md:118` already calls the SponsorBlock,
    Return YouTube Dislike, and Reddit hosts optional user-visible enrichment
    calls, while `tests/hardening.test.js:2165` through
    `tests/hardening.test.js:2171` currently require the old install-time
    store-safe grants. Chrome documents `optional_host_permissions` and the
    Permissions API for runtime grants, Mozilla documents MV3 runtime host
    grants under `optional_host_permissions`, and OWASP recommends optional
    permissions where possible for least privilege
    (https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions,
    https://developer.chrome.com/docs/extensions/reference/api/permissions,
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions,
    https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html).
    [Verified]
  - Touches: `extension/core/data-flow.js`, `build-extension.js`,
    generated Chrome/Firefox manifests, permission/request helpers,
    feature-toggle paths for SponsorBlock/DeArrow, Return YouTube Dislike,
    Reddit comments, and thumbnail features, `tests/hardening.test.js`,
    `docs/store-permission-rationale.md`, `docs/cws-submission-checklist.md`,
    diagnostics/data-flow docs, and Firefox lint/load verification notes.
  - Acceptance: core YouTube hosts stay required in `host_permissions`; eligible
    enrichment hosts move into generated `optional_host_permissions` for
    store-safe Chrome and Firefox artifacts; a shared permission helper checks,
    requests, and observes grants/revocations without Chrome-only assumptions;
    each optional host request is triggered only by an explicit user gesture;
    denied or revoked grants leave the feature disabled/degraded with clear
    settings/control-state feedback and no repeated prompt loop; background
    fetch paths enforce both the existing origin allowlist and current runtime
    grant state; data-flow and diagnostics distinguish required,
    optional-granted, optional-denied, and inactive destinations; CSP still
    permits documented optional fetch targets or records the chosen strategy;
    hardening tests replace the current install-time assertions with
    required-vs-optional manifest coverage plus grant/deny/revoke behavior; and
    store permission docs explain the new runtime grant model.
  - Verify: `npm run check`, `npm test`, `npm run build`,
    `node sync-userscript.js`, a targeted manifest test proving store-safe
    required hosts and optional hosts are separate for Chrome and Firefox, a
    targeted permission-helper test for granted/denied/revoked states, and
    `rg -n "optional_host_permissions|permissions.request|permissions.contains|onRemoved|host_permissions" extension build-extension.js scripts tests docs`
    showing the new contract across source, tests, and docs. Manual unpacked
    Chrome and Firefox store-safe smoke checks should prove each optional
    feature prompts once, works after grant, and degrades after revoke.
  - Complexity: M

### Researcher Queue (Cycle 19 - 2026-06-04)

- [x] 🔬 `codeql-code-scanning-gate-2026-06-04` - inspected current
  workflows, code-scanning default setup, extension trust boundaries, Python
  companion subprocess/Flask paths, and current static-analysis docs. Detailed
  notes live in `docs/research-cycle-19-code-scanning.md`.
- [ ] P1 - 🔬🤖 Enable CodeQL code scanning for JavaScript extension code and the Python companion
  - Why: Astra Deck now has dependency audit, secret scanning, release
    provenance, no-eval checks, and security-disclosure planning, but it still
    has no semantic code-scanning gate for the actual extension/companion code.
    That leaves privileged message passing, DOM/TrustedHTML sinks, external
    fetch proxying, local Flask routes, subprocess/update paths, and loopback
    token handling covered mainly by bespoke tests and manual review instead of
    GitHub Security-tab alerts.
  - Evidence: `.github/workflows/validate.yml:19` grants only `contents: read`
    and contains JS, Python dependency-audit, and Python test jobs but no
    CodeQL/code-scanning job. `rg --files .github` lists no
    `.github/workflows/codeql*.yml`. `gh api
    repos/SysAdminDoc/Astra-Deck/code-scanning/default-setup --jq .` returns
    `state: not-configured` with detected `javascript`,
    `javascript-typescript`, and `python` languages, and
    `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open`
    returns 404 `no analysis found`. Security-sensitive surfaces include
    `extension/background.js:151` / `extension/background.js:459` /
    `extension/background.js:523` / `extension/background.js:581`,
    `extension/manifest.json:25` / `extension/manifest.json:31` /
    `extension/manifest.json:263`, `extension/ytkit.js:5193`,
    `extension/ytkit.js:28939`, `extension/ytkit.js:31157`,
    `astra_downloader/astra_downloader.py:87`,
    `astra_downloader/astra_downloader.py:1496`,
    `astra_downloader/astra_downloader.py:2552`, and
    `astra_downloader/astra_downloader.py:2813`. GitHub docs say CodeQL
    advanced setup can matrix languages and add Python after initial setup, and
    the built-in `security-extended` suite adds additional security queries
    beyond `default` (https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options,
    https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/code-scanning/codeql/codeql-query-suites).
    [Verified]
  - Touches: `.github/workflows/codeql.yml` or equivalent, optional
    `.github/codeql.yml`, `docs/repo-settings.md`, branch-protection required
    checks / ruleset settings if the CodeQL job is made required, and
    `RESEARCH_REPORT.md` / release checklist notes after the gate is proven.
  - Acceptance: a CodeQL workflow scans `javascript` and `python` on PRs,
    pushes to `main`, and a weekly schedule; uses
    `github/codeql-action/init` / `analyze` with least-privilege permissions
    (`contents: read`, `security-events: write`, `actions: read` only if
    needed); selects `security-extended` or a documented `security-and-quality`
    tradeoff; excludes `node_modules`, `build`, `mhtml`, `archive`, and
    generated release artifacts; runs without building or mutating release
    assets; uploads alerts to GitHub code scanning; records baseline findings
    and triage policy in docs; and, after at least one clean run, either adds
    the exact CodeQL check name to required status checks or records why it
    remains advisory-only.
  - Verify: `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/default-setup --jq
    .state` is no longer `not-configured` or the advanced setup workflow has a
    successful run; `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts
    --jq length` no longer returns `no analysis found`; `gh run list --workflow
    "CodeQL"` shows a green run on `main`; the Security -> Code scanning page
    shows JavaScript and Python analyses; `rg -n "security-events: write|queries:
    security-extended|language:|javascript|python" .github/workflows
    .github/codeql.yml docs/repo-settings.md` proves the intended contract; and
    a seeded harmless fixture or local CodeQL dry run proves the workflow fails
    or reports when a relevant test query fires.
  - Complexity: M

### Researcher Queue (Cycle 18 - 2026-06-04)

- [x] 🔬 `security-disclosure-channel-2026-06-04` - inspected root
  security-policy files, issue templates, contributor docs, repository security
  advisory state, private vulnerability reporting setting, and GitHub security
  policy / private reporting docs. Detailed notes live in
  `docs/research-cycle-18-security-disclosure.md`.
- [ ] 🔬🤖🔧 P1 — Publish security disclosure policy and enable private vulnerability reporting
  - Why: Astra Deck now has explicit secret-scanning, signing-key, release, and
    dependency-security queues, but the public repository has no `SECURITY.md`
    and private vulnerability reporting is disabled. A researcher who finds a
    key leak, extension privilege issue, companion loopback weakness, or release
    integrity failure currently has to use public issues or guess a private
    contact path. That conflicts with the signing-key leak runbook, which
    already refers to adding a `SECURITY.md` section during incident response.
  - Evidence: `Get-ChildItem -Path . -Force -File` shows no root
    `SECURITY.md`, and `.github/` contains issue templates plus PR/dependency
    workflow config but no security-policy file. `rg -n "SECURITY\.md|security
    policy|private vulnerability|report a vulnerability|security advisory"`
    finds release/signing references but no current disclosure instructions.
    `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq
    .` returns `enabled: false`, and `gh api
    repos/SysAdminDoc/Astra-Deck/security-advisories --jq length` returns `0`.
    GitHub docs say a `SECURITY.md` gives instructions for reporting
    vulnerabilities, and private vulnerability reporting gives public-repo
    researchers a structured private path without resorting to public
    disclosure or informal channels. [Verified]
  - Touches: root `SECURITY.md`, `README.md`/`CONTRIBUTING.md` links,
    `docs/signing-keys.md` leak-response wording, `docs/repo-settings.md`, and
    GitHub Settings -> Advanced Security -> Private vulnerability reporting.
  - Acceptance: root `SECURITY.md` exists and names supported versions,
    preferred private reporting path, expected response windows, what not to
    include in public issues, and high-priority classes such as signing-key
    exposure, extension permission bypass, companion loopback auth bypass,
    dependency compromise, and release artifact/provenance mismatch. Private
    vulnerability reporting is enabled for the repository; maintainer
    notifications are configured by watching the repo for all activity or
    security alerts; README/CONTRIBUTING link to the policy; and signing-key
    leak response points to repository security advisories instead of an
    ad-hoc future `SECURITY.md` section.
  - Verify: `Test-Path SECURITY.md` is true; `rg -n "Report a vulnerability|private
    vulnerability|security advisory|supported versions" SECURITY.md README.md
    CONTRIBUTING.md docs/signing-keys.md` finds the intended references.
    `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq
    .enabled` returns `true`, and the repository Security page exposes the
    private report path. A dry-run review confirms the policy tells users not
    to paste secrets, keys, exploit payloads, or private logs into public
    issues.
  - Complexity: S

### Researcher Queue (Cycle 17 - 2026-06-04)

- [x] 🔬 `signing-key-custody-path-2026-06-04` - inspected local
  `ytkit.pem` tracking state without printing key material, `.gitignore`,
  signing-key policy docs, release checklist references, and the CRX build
  path in `build-extension.js`. Detailed notes live in
  `docs/research-cycle-17-signing-key-custody.md`.
- [ ] 🔬🤖🔧 P0 — Move CRX signing key custody out of the repo worktree
  - Why: the CRX signing key is a long-lived private key that controls the
    self-distributed Chrome extension identity. Current docs say `ytkit.pem`
    lives outside the repo, but the build script hardcodes
    `path.join(__dirname, 'ytkit.pem')`, auto-moves a generated key back into
    the repo root, and this local checkout contains an ignored private-key file
    at that path. It is not tracked by git, but keeping real key material inside
    the repo worktree still raises accidental archive, tooling, prompt/log, and
    copy-risk beyond the documented custody model.
  - Evidence: `git ls-files --stage -- ytkit.pem` returns no tracked entry and
    `git log --oneline -- ytkit.pem` returns no history, while
    `git check-ignore -v -- ytkit.pem` resolves to `.gitignore:3:*.pem`.
    `Get-Item ytkit.pem` shows a 1732-byte local file, and a header-only boolean
    check confirms it begins like a private key; the key body was not printed.
    `docs/signing-keys.md` says "Never commit `ytkit.pem`" and "`ytkit.pem`
    lives outside the repo", but `build-extension.js` defines `CRX_KEY =
    path.join(__dirname, 'ytkit.pem')` and moves a generated CRX key into that
    root path when none exists. Chrome's extension docs say the `.pem` file
    contains the extension private key, and GitHub's ignore-file docs describe
    `.gitignore` as a commit-exclusion mechanism, not a storage-control
    boundary. [Verified]
  - Touches: `build-extension.js`, release/signing docs, local release
    checklist, `scripts/generate-release-manifest.js` if the manifest should
    record an external key-path policy, and maintainer machine key custody.
  - Acceptance: the build path accepts an explicit external signing-key path
    such as `ASTRA_CRX_KEY_PATH` or a CLI option, refuses to auto-generate or
    auto-move `ytkit.pem` into the repo root unless an explicit legacy override
    is set, and fails release builds with a clear message when the key path is
    missing. The maintainer moves the real key outside the repo worktree to the
    encrypted local-key location named in `docs/signing-keys.md`, keeps an
    offline backup, and verifies the old root `ytkit.pem` is absent from the
    repo checkout before release packaging. Docs and release checklist commands
    use the external key path and do not require printing key material.
  - Verify: `git status --ignored --short -- ytkit.pem` shows no root key file
    in the checkout; `Test-Path ytkit.pem` is false on the release checkout;
    `npm run build:userscript` fails with an intentional missing-key message
    when no external path is supplied, then succeeds when the external key path
    is supplied. Generated CRX extension ID is compared against the previous
    self-distributed ID before publishing, and no command prints PEM contents.
  - Complexity: M

### Researcher Queue (Cycle 16 - 2026-06-04)

- [x] 🔬 `actions-sha-pinning-policy-2026-06-04` - inspected
  `.github/workflows/*.yml`, `.github/dependabot.yml`, live repository Actions
  permissions, workflow token defaults, and GitHub Actions supply-chain
  hardening / Dependabot documentation. Detailed notes live in
  `docs/research-cycle-16-actions-sha-pinning.md`.
- [ ] 🔬🤖🔧 P2 — Pin GitHub Actions to full-length SHAs and restrict allowed action sources
  - Why: Astra Deck has release and validation workflows that rely on
    GitHub-hosted actions by mutable major tags. The repository currently
    allows all actions and does not require full-length SHA pins, so future
    workflow edits can introduce unreviewed action sources and current trusted
    action tags can still move. This matters most for `Build & Release`, which
    grants `contents: write`, `id-token: write`, and `attestations: write` while
    producing release artifacts and attestations.
  - Evidence: `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq
    "{enabled,allowed_actions,sha_pinning_required,selected_actions_url}"`
    returns `enabled: true`, `allowed_actions: all`,
    `sha_pinning_required: false`, and no selected-actions URL. `gh api
    repos/SysAdminDoc/Astra-Deck/actions/permissions/workflow --jq .` shows the
    default `GITHUB_TOKEN` permission is already `read` and workflows cannot
    create or approve PR reviews by default. `rg -n "uses:\s*[^#]+@"
    .github/workflows` finds 17 external action refs across `validate.yml`,
    `build.yml`, and `yt-dlp-smoke.yml`, all currently tag-pinned. GitHub's
    secure-use reference says a full-length commit SHA is the only immutable
    action reference, and repository settings can require full-length SHA pins.
    GitHub Actions settings and REST docs also support `allowed_actions:
    selected` plus `github_owned_allowed`, `verified_allowed`, and
    `patterns_allowed`; Dependabot supports `github-actions` version updates and
    same-line version comments for SHA-pinned action refs. [Verified]
  - Touches: `.github/workflows/validate.yml`, `.github/workflows/build.yml`,
    `.github/workflows/yt-dlp-smoke.yml`, `.github/dependabot.yml` if the
    Actions cadence/comment strategy changes, repository Actions permissions,
    and `docs/repo-settings.md`.
  - Acceptance: after the Node 24 action-major migration is complete, every
    external `uses:` entry is pinned to the full 40-character commit SHA from
    the action owner's repository, with a same-line version comment that
    preserves Dependabot update context. Each pin records the upstream tag or
    release it came from, and the update PR proves `Validate`, `Build & Release`
    on a tag or dry-run tag, and `yt-dlp Smoke` still pass. Repository Actions
    permissions are then changed from `allowed_actions: all` to `selected` with
    GitHub-owned actions allowed and broad verified-creator allowance disabled,
    followed by `sha_pinning_required: true`. Any non-GitHub-owned action added
    later must be explicitly named in `patterns_allowed` by repository, tag, or
    SHA.
  - Verify: `rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)"
    .github/workflows` returns no mutable major-branch action refs, while
    `rg -n "uses:\s*[^#]+@[0-9a-f]{40}(\s|$)" .github/workflows` lists every
    external action. `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq
    "{allowed_actions,sha_pinning_required}"` returns `selected` and `true`.
    `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/selected-actions
    --jq .` shows GitHub-owned actions allowed, verified creators disabled, and
    only deliberate extra patterns. A throwaway PR or workflow-dispatch run
    proves the SHA-pinning policy does not block `Validate` or release-artifact
    generation.
  - Complexity: S

### Researcher Queue (Cycle 15 - 2026-06-04)

- [x] 🔬 `secret-scanning-alert-triage-2026-06-04` - inspected live GitHub
  secret-scanning alert state, alert locations without printing the secret
  value, current repository security-analysis settings, and GitHub secret
  scanning / alert remediation documentation. Detailed notes live in
  `docs/research-cycle-15-secret-scanning-alert.md`.
- [ ] 🔬🤖🔧 P0 — Triage and resolve open Google API Key secret-scanning alert
  - Why: GitHub currently reports an open `google_api_key` secret-scanning
    alert on the public repository. The alert is marked `publicly_leaked: true`,
    `multi_repo: true`, and `validity: unknown`; leaving it open makes it
    unclear whether Astra Deck is shipping a deliberately public YouTube
    bootstrap key, an accidentally committed credential, or a stale historical
    leak that has already been revoked.
  - Evidence: `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts?state=open`
    returns one open alert: number 1, type `google_api_key`, created
    2026-01-26, unresolved, validity unknown. Its locations include current and
    historical generated userscript/extension paths such as `YTKit.user.js`,
    `extension/ytkit.js`, `extension/core/transcript-service.js`, and archived
    userscript snapshots; the secret value was not printed during research.
    `gh api repos/SysAdminDoc/Astra-Deck --jq ".security_and_analysis"` shows
    secret scanning and push protection enabled, but
    `secret_scanning_non_provider_patterns` and
    `secret_scanning_validity_checks` disabled. GitHub docs say secret scanning
    alerts should be evaluated for validity/metadata where supported and then
    remediated or resolved with an explicit REST API resolution enum such as
    `revoked`, `false_positive`, `used_in_tests`, or `wont_fix`. [Verified]
  - Touches: GitHub Security -> Secret scanning alert 1, Google Cloud/API key
    owner action if the key is real, current source/generated userscript files
    if the embedded key must be removed or replaced, and `docs/repo-settings.md`
    if repository secret-scanning settings change.
  - Acceptance: alert 1 is explicitly triaged without exposing the secret value.
    If it is a real credential, revoke/rotate it in the provider console, remove
    it from current source/build outputs, and resolve the GitHub alert as
    revoked only after replacement artifacts are clean. If it is an intentional
    public YouTube/Innertube bootstrap key, document that rationale in the
    source or release/security notes, confirm no private quota-bearing key is
    involved, and resolve the alert with the appropriate non-secret resolution.
    Enable secret-scanning validity checks and non-provider pattern scanning
    where the repository/account exposes those settings, or record why they are
    unavailable.
  - Verify: `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts/1 --jq
    "{state,resolution,resolved_at,validity,publicly_leaked,multi_repo}"`
    shows a resolved state with a deliberate resolution, or an open state only
    while provider revocation is actively in progress. `gh api
    repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts?state=open --jq
    "length"` returns `0` after remediation. `gh api
    repos/SysAdminDoc/Astra-Deck --jq ".security_and_analysis"` records the
    final secret-scanning setting statuses. Do not log, paste, or commit the
    secret value while verifying.
  - Complexity: S

### Researcher Queue (Cycle 14 - 2026-06-04)

- [x] 🔬 `release-doc-contract-reconciliation-2026-06-04` - inspected
  current release workflow, v4.46.0 release assets/digests, tag-run
  attestation steps, signing-key policy docs, architecture CI docs, and stale
  research-report sections. Detailed notes live in
  `docs/research-cycle-14-release-doc-contract-reconciliation.md`.
- [ ] 🔬🤖 P2 — Reconcile release automation docs with maintainer-local artifact contract
  - Why: the actual release contract is now split: CI builds validation
    artifacts, emits `release-manifest.json` / `SHA256SUMS`, and creates
    attestations for CI-built artifacts, while public CRX artifacts remain
    maintainer-local because `ytkit.pem` must not enter CI. Some docs still say
    the CI workflow creates GitHub Releases directly or still describe the
    pre-v4.46 checksum/provenance gap, which can send future release work down
    the wrong path.
  - Evidence: `.github/workflows/build.yml` has `workflow_dispatch` and tag
    triggers, runs version checks/build/SBOM/manifest generation, uploads
    `build/*` as a workflow artifact, and runs `actions/attest-build-provenance`
    / `actions/attest-sbom`; it does not call `gh release create` or
    `gh release upload`. `docs/signing-keys.md` explicitly says CI never
    receives `ytkit.pem` and does not publish GitHub Releases; the maintainer
    builds public CRX artifacts locally and uploads them with the local checksum
    manifest. `docs/architecture.md` still summarizes CI as ending in
    `gh release create`. `gh release view v4.46.0 --json assets` shows 12
    public assets with GitHub SHA-256 digest fields, and tag run `26951406026`
    completed the CI attestation steps for CI-built artifacts. GitHub's
    artifact-attestation docs distinguish CI-generated attestations that can be
    verified with `gh attestation verify`; maintainer-local release assets
    instead
    need digest comparison against `SHA256SUMS`. [Verified]
  - Touches: `docs/architecture.md`, release checklist/runbook docs, and any
    stale report/checklist text that describes CI as publishing GitHub Releases
    or says checksum/provenance/privacy/Python-audit artifacts are still absent
    after the 2026-06-04 closures.
  - Acceptance: the docs name one current release contract: CI tag runs validate,
    build, upload workflow artifacts, and create attestations for CI-built
    files; maintainer-local release steps create/update the GitHub Release with
    locally signed CRX artifacts, Firefox ZIP/XPI artifacts, and checksum
    manifest; verification instructions
    distinguish `gh attestation verify` for CI-built files from release-asset
    digest comparison for maintainer-local files. `docs/architecture.md` no longer
    claims `build.yml` runs `gh release create`, and stale "not yet in place"
    statements for shipped release, privacy, and Python audit artifacts are
    removed from current docs.
  - Verify: `rg -n "gh release create|current public latest release lags|not yet attach|not yet shipped|does not yet attach|Python dependency vulnerability auditing is not yet" docs RESEARCH_REPORT.md`
    returns no current false-positive statements outside archived research and
    explicit Cycle 14 evidence/status notes. Confirm
    `docs/signing-keys.md`, `docs/architecture.md`, and release checklist text
    agree on CI-built vs maintainer-local artifacts.
  - Complexity: S

### Researcher Queue (Cycle 13 - 2026-06-04)

- [x] 🔬 `actions-node24-readiness-2026-06-04` - inspected current
  workflow action pins, the latest `Validate` and `Build & Release` logs,
  open Dependabot PRs, GitHub's Node 20 runner deprecation notice, and current
  GitHub-owned action release majors. Detailed notes live in
  `docs/research-cycle-13-actions-node24-readiness.md`.
- [ ] 🔬🤖 P1 — Migrate GitHub Actions workflows to Node 24 action majors
  - Why: GitHub-hosted runners start defaulting JavaScript actions to Node 24
    on 2026-06-16 and remove Node 20 later in 2026. Astra Deck's current
    validation and release jobs are green, but they already emit Node 20
    deprecation warnings. Leaving the release workflow on old action majors
    risks discovering a platform/runtime break during the next tag build rather
    than in a normal PR.
  - Evidence: `gh run view 26953094214 --log` on the latest `main` `Validate`
    run reports Node 20 warnings for `actions/checkout@v4`,
    `actions/setup-node@v4`, `actions/setup-python@v5`, and
    `actions/upload-artifact@v4`. `gh run view 26951406026 --log` on the latest
    `Build & Release` tag run reports the same warning family for
    `actions/checkout@v4`, `actions/setup-node@v4`, and
    `actions/upload-artifact@v4`. `rg -n "uses:" .github/workflows` shows those
    pins repeated across `validate.yml`, `build.yml`, and `yt-dlp-smoke.yml`.
    Official GitHub changelog says runners begin using Node 24 by default on
    2026-06-16 and tells workflow users to update to latest action versions that
    run on Node 24. Current official releases are `actions/checkout@v6.0.3`,
    `actions/setup-node@v6.4.0`, `actions/setup-python@v6.2.0`, and
    `actions/upload-artifact@v7.0.1`; their READMEs/release notes document Node
    24-ready major versions and minimum runner requirements already satisfied
    by the hosted runner version seen in the logs. [Verified]
  - Touches: `.github/workflows/validate.yml`, `.github/workflows/build.yml`,
    `.github/workflows/yt-dlp-smoke.yml`, and possibly `.github/dependabot.yml`
    if grouping or review order should prevent one action bump from being
    stranded behind another.
  - Acceptance: all workflow uses of `actions/checkout@v4`,
    `actions/setup-node@v4`, `actions/setup-python@v5`, and
    `actions/upload-artifact@v4` are migrated to Node 24-ready majors. Coordinate
    with the dependency-graph enablement item so PR #11's setup-python bump is
    not blocked by an unsupported Dependency review check. `Validate` passes on
    a PR and on `main`; `Build & Release` passes on a tag ref, either a
    throwaway tag push or `workflow_dispatch --ref <tag>`, so tag-only
    attestations are exercised; `yt-dlp Smoke` passes on `workflow_dispatch`.
    The completed runs no longer contain the Node 20 deprecation warning.
  - Verify: run or inspect `gh pr checks` for the migration PR, then check each
    completed workflow log with `gh run view <run-id> --log | Select-String
    "Node.js 20 actions are deprecated"`. Confirm no matches for `Validate`,
    `Build & Release`, or `yt-dlp Smoke`, and confirm the artifact/SBOM upload
    paths still publish expected artifacts after the upload-artifact migration.
  - Complexity: S

### Researcher Queue (Cycle 12 - 2026-06-04)

- [x] 🔬 `dependency-review-enablement-2026-06-04` - inspected open
  Dependabot PR #11, its failed `Validate / Dependency review` logs, repository
  security-analysis API output, and current GitHub dependency graph /
  dependency review documentation. Detailed notes live in
  `docs/research-cycle-12-dependency-review-enablement.md`.
- [ ] 🔬🤖🔧 P1 — Enable dependency graph before requiring Dependency review
  - Why: branch protection now requires the core `Validate` jobs, and the
    workflow contains a PR-only `Dependency review` job, but the first open
    Dependabot PR that exercises it fails before reviewing any dependency diff.
    The failure is a repository security-analysis setting gap, so legitimate
    dependency-maintenance PRs can be blocked without an actionable vulnerable
    dependency finding.
  - Evidence: PR #11
    (`ci(deps): bump actions/setup-python from 5 to 6`) has green `JS tests +
    check gate`, `Python dependency audit`, and `Python downloader tests`
    checks, but `gh run view 26950993002 --log-failed` reports
    `Dependency review is not supported on this repository. Please ensure that
    Dependency graph is enabled`. `gh api repos/SysAdminDoc/Astra-Deck --jq
    "{private,security_and_analysis:.security_and_analysis}"` shows a public
    repository with secret scanning enabled, Dependabot security updates
    disabled, and no dependency-graph field in the returned security-analysis
    block. GitHub docs state that dependency review becomes available when the
    dependency graph is enabled, supports the same ecosystems as the dependency
    graph, and that the dependency review action can fail PRs that introduce
    vulnerable dependencies. The action README documents public-repository
    support and branch-protection use for requiring the check. [Verified]
  - Touches: GitHub repository Settings -> Code security and analysis, branch
    protection required-check selection after the setting is fixed, and
    `docs/repo-settings.md` to record the resulting policy.
  - Acceptance: dependency graph and Dependabot alerts/security updates are
    enabled for the repository where available, or the project records why the
    setting cannot be enabled and temporarily removes or guards the
    `Dependency review` check so dependency PRs are not blocked by platform
    setup. PR #11 is rerun after the change and `Validate / Dependency review`
    either succeeds or fails only with concrete vulnerable-dependency findings.
    Branch protection keeps PR-only `Dependency review` separate from direct
    push checks until a PR run proves the exact required-check behavior, and
    `docs/repo-settings.md` records the chosen required contexts.
  - Verify: `gh api repos/SysAdminDoc/Astra-Deck --jq
    ".security_and_analysis"` shows dependency graph / Dependabot alert
    enablement where GitHub exposes it; rerun PR #11's `Validate` workflow and
    inspect the `Dependency review` job summary. Confirm
    `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks`
    still requires only checks that run in the protected update path, or that
    an active ruleset documents equivalent behavior.
  - Complexity: S

### Researcher Queue (Cycle 11 - 2026-06-04)

- [x] 🔬 `main-required-status-checks-2026-06-04` - inspected live GitHub
  branch-protection/ruleset settings, recent `Validate` runs, and GitHub
  protected-branch/ruleset documentation. Detailed notes live in
  `docs/research-cycle-11-main-protection-status-checks.md`.
- [x] 🔬🤖🔧 P1 — Require green validation checks before `main` updates
  - Why: the CI and dependency gates are now stronger, but `main` protection
    does not currently require them before updates. Earlier failed `Validate`
    runs still landed on `main`; branch protection should enforce the same
    standard the roadmap asks implementers to meet.
  - Evidence: `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection`
    shows branch protection exists with `enforce_admins.enabled: true`,
    `required_conversation_resolution.enabled: true`, and force pushes/deletions
    disabled, but `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks`
    returns HTTP 404 with `Required status checks not enabled`. `gh api
    repos/SysAdminDoc/Astra-Deck/rulesets` returns `[]`. Recent `gh run list
    --workflow Validate --limit 8` shows `Validate` is green after the CI and
    dependency-audit fixes, but also shows failed `main` pushes from
    2026-06-04 earlier in the day. GitHub's branch-protection REST docs define
    `required_status_checks` as the setting that requires status checks before
    merging and note that `enforce_admins` applies restrictions to repository
    administrators; GitHub rulesets can layer rules across branches and expose
    enforcement status for auditing. [Verified]
  - Touches: GitHub repository settings or API only; no source files required
    beyond documenting the chosen rule in release/runbook docs.
  - Acceptance: `main` has either protected-branch required checks or an active
    branch ruleset targeting `main` that requires the latest successful
    `Validate` job contexts before merge/update. At minimum require
    `Validate / JS tests + check gate`, `Validate / Python dependency audit`,
    and `Validate / Python downloader tests`; for pull requests also require
    `Validate / Dependency review` once a PR run has established the exact
    context. Keep force pushes and deletions disabled, keep admin enforcement
    enabled unless the maintainer explicitly records a bypass policy, and record
    any required-check context names in a short repo-settings note.
  - Verify: `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks`
    returns 200 with `strict: true` and the expected checks, or `gh api
    repos/SysAdminDoc/Astra-Deck/rulesets` shows an active `main` ruleset with
    equivalent required checks. Open a throwaway PR that changes a dependency or
    test fixture and confirm merge is blocked until required checks are green.
  - Complexity: S
  - Status 2026-06-04: delivered through classic branch protection. The required
    check contexts are documented in `docs/repo-settings.md` and match the live
    GitHub Actions check-run names on `main`: `JS tests + check gate`, `Python
    dependency audit`, and `Python downloader tests`. `Dependency review` is
    intentionally documented as a PR-only follow-up context because it is skipped
    on direct pushes until a throwaway PR confirms the exact required-check
    behavior.

### Researcher Queue (Cycle 10 - 2026-06-04)

- [x] 🔬 `python-dependency-audit-gate-2026-06-04` - inspected
  Dependabot config, validation workflow, companion requirements, existing npm
  audit gate, prior dependency research, and current PyPA/GitHub dependency
  review guidance. Ran a local `pip-audit` probe against the downloader
  requirements; detailed notes live in
  `docs/research-cycle-10-python-dependency-audit.md`.
- [x] 🔬🤖 P2 — Add a Python companion dependency audit gate
  - Why: `npm run check` already gates JavaScript production dependency
    vulnerabilities with `npm audit --omit=dev --audit-level=moderate`, and
    Dependabot opens Python dependency PRs, but the Astra Downloader companion
    has no equivalent CI vulnerability audit for `astra_downloader/requirements.txt`.
    The current requirements resolution is clean, so this is a preventive
    supply-chain gate rather than an emergency patch.
  - Evidence: `.github/dependabot.yml` covers npm, pip, and GitHub Actions;
    `.github/workflows/validate.yml` installs Python dependencies and runs
    `python -m pytest astra_downloader`, but it does not run `pip-audit` or a
    dependency-review check. `package.json` wires `audit:deps` into
    `npm run check`, so only the Node side has a standing vulnerability gate.
    Local probe on 2026-06-04:
    `py -3.12 -m pip_audit -r astra_downloader/requirements.txt --format json --progress-spinner off`
    exited 0 and reported no known vulnerabilities across 25 resolved packages
    (yt-dlp, curl-cffi, PyQt6, Flask, requests, waitress, and transitive deps).
    PyPA documents `pip-audit -r ./requirements.txt` for requirements-file
    audits and exit code 1 on known vulnerabilities
    (https://github.com/pypa/pip-audit). The official `pypa/gh-action-pip-audit`
    action accepts requirements-style `inputs`, PyPI/OSV vulnerability services,
    and explicit ignore lists
    (https://github.com/pypa/gh-action-pip-audit). GitHub's dependency review
    action can fail PRs that introduce vulnerable dependency versions
    (https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependency-review).
    [Verified]
  - Touches: `.github/workflows/validate.yml`, optionally a dedicated
    dependency-review workflow/config, `astra_downloader/requirements.txt`
    comments for any temporary advisory ignore, `docs/cws-submission-checklist.md`
    / release checklist, and `RESEARCH_REPORT.md` once implemented.
  - Acceptance: PR/push validation runs a Python dependency audit for
    `astra_downloader/requirements.txt` after dependency install or through
    `pypa/gh-action-pip-audit@v1.1.0`; moderate-or-higher fixable advisories
    fail CI unless a documented temporary ignore with advisory ID, reason,
    applicability analysis, and expiry is present. Dependency-change PRs also
    get dependency-review coverage so a Dependabot bump cannot introduce a
    vulnerable transitive package unnoticed. The audit result is visible in the
    workflow summary or an uploaded JSON artifact for release review.
  - Verify: intentionally run the audit step locally with
    `py -3.12 -m pip_audit -r astra_downloader/requirements.txt --format json`;
    dispatch or push `Validate`; confirm the Python audit step passes on the
    clean baseline and fails on a temporary known-vulnerable requirement in a
    throwaway branch. Keep the existing `python -m pytest astra_downloader`,
    `npm run check`, and `npm test` gates green.
  - Complexity: S
  - Status 2026-06-04: delivered. `Validate` now has a dedicated Python
    dependency-audit job that installs `pip-audit`, audits
    `astra_downloader/requirements.txt` as JSON, uploads
    `astra-downloader-pip-audit`, and fails the push/PR gate on any known
    vulnerability finding that has not been explicitly ignored. Pull requests
    also run `actions/dependency-review-action@v5` with moderate-or-higher
    vulnerability failure and license policy disabled until a maintainer sets
    one.

### Researcher Queue (Cycle 9 - 2026-06-04)

- [x] 🔬 `privacy-consent-readiness-2026-06-04` - inspected the current
  manifest profile split, `docs/store-permission-rationale.md`,
  `docs/cws-submission-checklist.md`, `scripts/manifest-patch.js`, the
  data-flow catalogue, background cookie/proxy paths, and current Chrome /
  Mozilla privacy-disclosure and Firefox data-consent rules. Detailed notes
  live in `docs/research-cycle-9-privacy-consent-readiness.md`.
- [x] 🔬🤖 P1 — Ship cross-store privacy disclosure and Firefox data-consent packet
  - Why: Astra Deck already has strong store permission rationale and profile
    split mechanics, but the release path still lacks a stable privacy-policy
    artifact and a Firefox data-transmission consent strategy that matches the
    current public-store rules. This is now a release-readiness blocker because
    the extension stores local user activity/content, uses `cookies` for
    authenticated downloader handoff, and can transmit page/video context to
    third-party APIs or the local companion depending on feature/profile.
  - Evidence: `docs/cws-submission-checklist.md` says a privacy-policy URL is
    required and points at reviewer copy, but the repo search found no
    concrete privacy-policy page/file or published-policy checklist. Chrome's
    privacy-fields docs require single-purpose, per-permission justification,
    data-use disclosure/certification, and a privacy-policy link
    (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy); Chrome
    Web Store policies require an accurate policy, Limited Use disclosure, and
    narrow permissions (https://developer.chrome.com/docs/webstore/program-policies/policies).
    Mozilla's add-on policies define data transmission as data handled outside
    the add-on or local browser, require consent/control for that transmission,
    and require opt-in before transmitting personal data such as cookies
    (https://extensionworkshop.com/documentation/publish/add-on-policies/).
    Firefox's built-in data consent is available for desktop 140+, but
    `scripts/manifest-patch.js` currently emits `strict_min_version: '128.0'`
    and no `browser_specific_settings.gecko.data_collection_permissions`; the
    Firefox guidance says Firefox 139-and-earlier installs need a custom data
    collection experience or a higher minimum version
    (https://www.extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
    The local `data-flow.js` catalogue includes store-safe transmissions to
    YouTube, thumbnails, SponsorBlock/DeArrow, Return YouTube Dislike, and
    Reddit plus GitHub-full transmissions to BYO-key AI providers, local Ollama,
    Astra Downloader loopback, and Cobalt. [Verified]
  - Touches: `docs/privacy-policy.md` or equivalent hosted policy source,
    README/homepage/store links, `docs/cws-submission-checklist.md`,
    `docs/store-permission-rationale.md`, `scripts/manifest-patch.js`,
    `tests/hardening.test.js`, and the first-run / consent UI if Firefox 128-139
    support is kept.
  - Acceptance: a stable privacy-policy source exists and is linked from the
    project homepage/README and store-submission docs; it declares local-only
    storage categories, third-party API transmissions, local companion handoff,
    cookie use, BYO-key provider behavior, retention/export/delete behavior, no
    telemetry/ads/sale, and the Chrome Limited Use statement. The Chrome
    dashboard matrix is documented with data categories and permission/host
    justifications that match the store-safe artifact. Firefox chooses and tests
    one clear path: either raise the Firefox minimum to 140+ and add
    `data_collection_permissions` with required/optional categories matching
    the data-flow catalogue, or keep Firefox 128+ and ship an unmissable
    single-page consent/control flow before any data-transmitting feature runs
    on Firefox versions without built-in consent. GitHub-full-only hosts remain
    absent from public store-safe artifacts.
  - Verify: `npm run check`, `npm test`, `node build-extension.js --profile both`,
    inspect both generated Firefox manifests for the chosen data-consent path,
    inspect the Chrome store-safe manifest/CSP for no GitHub-full hosts, run
    `rg -n "privacy policy|Limited Use|data_collection_permissions"` across
    README/docs/build output, and include Firefox reviewer notes for any
    remaining 128-139 support path.
  - Complexity: M
  - Status 2026-06-04: delivered. `docs/privacy-policy.md` is now the stable
    privacy-policy source linked from README and submission docs; it covers
    local storage, third-party transmissions, local companion/cookie handoff,
    BYO-key behavior, retention/export/delete, no telemetry/ads/sale, and the
    Chrome Limited Use statement. The Firefox path is Firefox 140+ built-in
    data consent: `scripts/manifest-patch.js` raises `strict_min_version` to
    `140.0` and injects required `data_collection_permissions` for
    `browsingActivity`, `websiteContent`, `websiteActivity`, and
    `authenticationInfo`, with tests pinning the manifest and policy packet.

### Researcher Queue (Cycle 8 - 2026-06-04)

- [x] 🔬 `cycle-8-ci-release-trust-2026-06-04` - inspected current
  `origin/main`, recent GitHub Actions runs, release assets, profile-split build
  outputs, companion checksum verification, signing-key policy, and primary
  Qt/GitHub/npm/Mozilla/Chrome supply-chain docs. Detailed notes live in
  `docs/research-cycle-8-ci-release-integrity.md`.
- [x] 🔬🤖 P0 — Restore green GitHub Validate for Python downloader tests
  - Why: every recent push on `main` is failing the `Validate` workflow even
    though the JS job is green; release and roadmap-drain confidence are now
    gated by a Python collection error, not by product behavior.
  - Evidence: `gh run list --workflow Validate --limit 12` returned 12
    consecutive failures on 2026-06-04. The latest run
    `https://github.com/SysAdminDoc/Astra-Deck/actions/runs/26946855242`
    shows `Python downloader tests` failing during collection with
    `ImportError: libEGL.so.1: cannot open shared object file` after
    `astra_downloader/astra_downloader.py` imports `PyQt6.QtWidgets` at module
    import time. `.github/workflows/validate.yml` installs Python packages and
    runs `python -m pytest astra_downloader` without Linux Qt/X11/OpenGL system
    libraries or an offscreen/Xvfb wrapper. Qt's Linux requirements document
    lists xcb platform-plugin dependencies and OpenGL dependencies for Qt GUI /
    Widgets on Linux (https://doc.qt.io/qt-6/linux-requirements.html). [Verified]
  - Touches: `.github/workflows/validate.yml`, possibly
    `.github/workflows/build.yml`, `pytest.ini`,
    `astra_downloader/astra_downloader.py`, and
    `astra_downloader/test_astra_downloader.py`.
  - Acceptance: the Python CI job collects and runs the full downloader test
    suite on `ubuntu-latest`; the job either installs the minimal Qt runtime
    libraries (`libegl1` / xcb / xkbcommon family as needed) and runs GUI tests
    under `QT_QPA_PLATFORM=offscreen` or `xvfb-run`, or lazy-loads GUI imports so
    API-only tests do not require Qt platform libraries. Existing `qt_api` /
    asyncio pytest config warnings are removed or pinned by an installed plugin
    set. A future missing-Qt-runtime regression fails with a clear workflow
    message rather than an import-time crash.
  - Verify: push or dispatch `Validate`, then confirm both jobs pass with
    `gh run view <run-id> --json jobs`; locally run
    `python -m pytest astra_downloader` and the existing `npm test` /
    `npm run check` gates.
  - Complexity: S
  - Status 2026-06-04: delivered. The Python CI job now installs the minimal
    Linux Qt runtime package set, exports `QT_QPA_PLATFORM=offscreen`, disables
    downloader auto-bootstrap during CI dependency checks, installs
    `pytest-asyncio` / `pytest-qt` so `pytest.ini` config keys are owned, and
    runs a PyQt runtime preflight before pytest with a GitHub error annotation
    for missing `libEGL` / xcb support libraries.
- [x] 🔬🤖 P1 — Publish a v4.46+ release catch-up with checksums and provenance
  - Why: the source tree and generated build artifacts are on v4.46.0, but
    `https://github.com/SysAdminDoc/Astra-Deck/releases/latest` still serves
    v4.5.2. Users following README "latest release" links miss the profile-split
    v4.46.0 artifacts and dozens of shipped hardening/features; the companion
    updater also expects `AstraDownloader.exe.sha256`, while the release workflow
    currently uploads `build/*` without an explicit release manifest, checksum
    sidecars, SBOM attachment, or artifact attestation step.
  - Evidence: `package.json` / `extension/manifest.json` are v4.46.0; local
    `build/` contains eight profile-split v4.46.0 extension artifacts; `gh
    release view --json tagName,assets` reports latest release `v4.5.2` from
    2026-05-21 with only five legacy assets; `.github/workflows/build.yml`
    uploads `build/*` via `gh release create ... --generate-notes`; companion
    update code fetches
    `https://github.com/SysAdminDoc/Astra-Deck/releases/latest/download/AstraDownloader.exe.sha256`;
    GitHub release assets expose SHA-256 `digest` fields
    (https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28);
    GitHub supports artifact and SBOM attestations through `actions/attest`
    (https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations);
    `npm sbom` can emit SPDX or CycloneDX SBOMs
    (https://docs.npmjs.com/cli/commands/npm-sbom/); Mozilla requires signed
    add-ons for default Firefox release/beta installs and supports signing
    self-distributed WebExtensions with `web-ext sign`
    (https://devdoc.net/web/developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Distribution.html).
    [Verified]
  - Touches: release checklist/docs, `.github/workflows/build.yml`,
    `build-extension.js` or a new release-manifest script, README release
    instructions, `docs/signing-keys.md`, and companion release packaging if
    `AstraDownloader.exe` is attached.
  - Acceptance: after the P0 CI fix, the latest GitHub release tag matches the
    live product version, includes all eight store-safe/GitHub-full Chrome and
    Firefox artifacts plus userscript and companion assets when present, and
    attaches a machine-readable `SHA256SUMS` / release manifest with file name,
    size, profile, browser, version, and SHA-256 for every asset. If artifacts
    are CI-built, the workflow grants `id-token: write` and `attestations: write`
    and creates release/SBOM attestations that `gh release verify-asset` can
    validate. If CRX/XPI must remain maintainer-local because of `ytkit.pem`,
    `docs/signing-keys.md` and the release checklist explicitly document that
    path and require local checksum sidecars before upload.
  - Verify: `node scripts/check-versions.js --tag <version>`,
    `npm run build:userscript`, checksum-manifest generation, `gh release view
    <tag> --json assets`, `gh release verify-asset <tag> <asset>` where
    attested, and companion `/update` hash verification against the published
    `.sha256` sidecar.
  - Complexity: M
  - Status 2026-06-04: delivered as
    `https://github.com/SysAdminDoc/Astra-Deck/releases/tag/v4.46.0`. The public
    release targets `ac6a3633165547bbb0358191e43fe2038dbfbf73`, is the latest
    release, and attaches 12 assets: eight profile-split extension artifacts,
    userscript, CycloneDX npm SBOM, `release-manifest.json`, and `SHA256SUMS`.
    Local digest comparison verified every uploaded GitHub release asset against
    the local files / `SHA256SUMS`. The tag `Build & Release` run
    `26951406026` passed and produced CI build/SBOM attestations for CI-built
    artifacts; public CRX assets intentionally remain local-signed with
    `ytkit.pem`, so `gh release verify-asset` is not expected to validate those
    local release assets.

### Researcher Queue (Cycle 7 - 2026-06-04)

- [x] 🔬 `locale-proofing-current-counts-2026-06-04` - regenerated
  `docs/i18n-coverage.md` with `node scripts/i18n-coverage.js` after the
  feature-definition i18n extraction. The report now reflects 860 EN keys rather
  than the stale 247-key snapshot, and the locale-proofing row now calls out the
  feature-key-specific proofing debt.

### Researcher Queue (Cycle 6 - 2026-06-04)

- [x] 🔬 `overlay-a11y-target-map-2026-06-04` - inspected
  `scripts/audit-popup-a11y.js`, `scripts/check-contrast.js`,
  `docs/screen-reader-smoke.md`, toast DOM, and in-page overlay render paths.
  The WCAG overlay row now names the first-pass overlay targets and measurable
  assertions instead of asking for a broad manual audit.

### Researcher Queue (Cycle 5 - 2026-06-04)

- [x] 🔬 `firefox-parity-gate-shape-2026-06-04` - inspected
  `build-extension.js`, `scripts/manifest-patch.js`, `.github/workflows/build.yml`,
  `docs/signing-keys.md`, `docs/firefox-executescript-preflight.md`, and
  manifest-patch tests. The Firefox parity row now distinguishes existing static
  manifest-patch coverage from the missing release-artifact `web-ext lint` and
  clean-profile Firefox load gate.

### Researcher Queue (Cycle 4 - 2026-06-04)

- [x] 🔬 `capture-week-matrix-2026-06-04` - inspected the live selector fixture
  builder, selector-regression test, `selector-surface-matches.json`, selector
  pack metadata, and capture workflow. The MHTML capture-week row is now scoped
  as a concrete capture matrix with builder/test/documentation acceptance
  criteria instead of a generic "add fixtures" instruction.

### Researcher Queue (Cycle 3 - 2026-06-04)

- [x] 🔬 `cycle-3-report-reconciliation-2026-06-04` - reconciled
  `RESEARCH_REPORT.md` after the build lane shipped settings migration,
  settings import/export scrub, companion onboarding, Return YouTube Dislike
  estimate disclosure, diagnostics export, yt-dlp cookie threat-model docs, and
  selector-capture refresh work. This pass updated stale gap/risk language
  without adding duplicate implementation rows.

### Researcher Queue (Cycle 2 - 2026-06-04)

- [x] 🔬 `cycle-2-reconciliation-2026-06-04` - refreshed against
  `origin/main` after fetching (`git rev-list --left-right --count HEAD...@{u}`
  returned `0 0`) while treating the selector-capture implementation as separate
  build-lane work. This pass reconciled already-shipped Return YouTube Dislike
  disclosure, companion onboarding, diagnostics export, and i18n coverage work
  instead of adding duplicate rows.
- [ ] 🔬🤖 P3 — Locale proofing queue for identical-to-English feature copy
  - Why: the feature-definition i18n extraction is shipped, but the generated
    coverage report now shows only 23.5%-27.7% translated coverage across
    non-EN locales after feature keys were added. Chrome and MDN extension i18n
    guidance both treat
    `messages.json` as the user-visible string source of truth, so seeded
    English placeholders should be tracked separately from intentional brand or
    technical terms.
  - Evidence: refreshed `docs/i18n-coverage.md` profiles 860 EN keys and reports
    622-658 identical-to-EN strings per non-EN locale; a feature-key spot check
    found 584 of 612 `feature_*_(name|desc)` keys still identical-to-EN in every
    non-EN locale. `scripts/i18n-coverage.js` is informational only and does not
    separate intentional brand/technical matches from untranslated feature copy;
    Chrome i18n docs require user-visible strings in locale `messages.json`
    (https://developer.chrome.com/docs/extensions/reference/api/i18n);
    MDN documents the same WebExtensions i18n model
    (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization).
    [Verified]
  - Touches: `scripts/i18n-coverage.js`, `scripts/generate-locales.js`,
    `extension/_locales/*/messages.json`, `docs/i18n-coverage.md`,
    `CONTRIBUTING.md`.
  - Acceptance: coverage output separates intentional brand/technical matches
    from unresolved identical-to-EN placeholders, emits per-locale feature
    name/description identical counts plus sample keys, and supports a warning
    threshold so newly extracted user-facing strings cannot silently ship as
    English in non-EN locale bundles. The generator keeps a reviewed
    do-not-translate list for brands/technical tokens and the contributor guide
    explains how to submit native-speaker proofing patches.
  - Verify: `node scripts/i18n-coverage.js`, `npm run check`, and review one
    generated locale diff to confirm brand/technical terms were not
    over-translated.
  - Complexity: M

### Researcher Queue (Cycle 1 - 2026-06-04)

- [x] 🔬 `policy-firefox-ytdlp-npm-refresh-2026-06-04` - rechecked Chrome Web
  Store program policy, MDN `scripting.executeScript`, Mozilla Firefox 128 MV3
  MAIN-world notes, yt-dlp releases, and npm package metadata. Existing CWS,
  Firefox, selector-capture, and yt-dlp smoke rows remain current; `crx3` is
  current, `npm audit --omit=dev --audit-level=moderate` is clean, and ESLint
  has only a low-risk patch/minor freshness drift (`10.2.1` installed,
  `10.4.1` current). No new non-duplicate row was promoted.

*Research conducted 2026-06-03. Items below are new — not duplicates of Existing
Planned Work.*

Grouped by category, ordered P0 → P3. Each item is evidence-tied to the current
tree (manifest, settings schema, core modules, build scripts, workflows,
companion service) and to the competitive / standards landscape (Chrome Web Store
MV3 program policy, AMO Firefox MV3, WCAG 2.2 AA, the SponsorBlock / DeArrow /
Enhancer for YouTube / PocketTube / BlockTube / Return YouTube Dislike ecosystem,
and yt-dlp cookie-handling advisories).

2026-06-04 refresh: NF6, NF2, dead-channel staging, store-safe / GitHub-full
artifact split, and monthly yt-dlp smoke CI have moved into completed work.
Current Chrome Web Store, Firefox MV3, and YouTube Data API source checks keep
the existing store-policy, Firefox smoke, and local-first subscription-staging
rows relevant; no new duplicate research row was promoted.

### Phase 1 Competitive Matrix Carry-Forward

The full competitive matrix lives in
`docs/archive/roadmap-dossier-2026-05-21.md`; these two rows stay visible here
because the v4.47.0 polish batch promoted them as active comparison references.

| # | Competitor | Owner | Surfaces | Status | Scope | Relevant Astra parity surface | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 21 | Iridium for YouTube | iridiumio | Chrome, Edge, Firefox | CWS listing active (noted in `docs/research/iter-8-sources.md`, added 2026-05-20). Closed-source. | broad | Codec/quality controls, player polish, ad/sponsor handling; overlaps Astra's `qualityProfileMatrix` + `forceH264` surface. | https://chromewebstore.google.com/detail/iridium-for-youtube/ |
| 22 | Control Panel for YouTube | Jasper de Groot | Chrome, Firefox | CWS listing noted in iter-8 sources (2026-05-20); deeper feature scoring pending. | broad | UI tweaks + control panel for layout / Shorts / channels; presumed quality/UI control. | CWS listing per iter-8 sources |

### Quick Wins

- [x] P1 — Reconcile version surfaces and label legacy internal planning-track "v5.0.0 foundation" framing
  - Why: the shipping product is `4.46.0` (`package.json`, `extension/manifest.json`,
    `docs/architecture.md`), yet `COMPLETED.md` and the archived dossier used an
    internal planning-track "v5.0.0 foundation arc effectively complete" and
    internal planning-track v5.0.0 -> v6.0.0 plan. A
    reader cannot tell the real release line from the planning line, and
    `check-versions.js` only validates the surfaces it knows about.
  - Evidence: `package.json` version `4.46.0`; `extension/manifest.json` version
    `4.46.0`; `docs/architecture.md` "(what is, today, at v4.46.0+)";
    COMPLETED.md internal planning-track "v5.0.0 Foundation Arc" / internal
    planning-track "v5.1 Carry-Forward Arc"; archived dossier internal
    planning-track "v5.0.0 foundation arc effectively complete." [Verified]
  - Touches: `COMPLETED.md`, `RESEARCH_REPORT.md`, `docs/architecture.md` doc
    prose only (no code).
  - Acceptance: every doc states the real shipped version (4.46.x) and labels the
    v5/v6 numbering explicitly as an internal planning track, not shipped releases.
  - Verify: `node scripts/check-versions.js` stays green; grep for "v5.0.0" /
    "v6.0.0" finds only planning-track-labelled mentions.
  - Complexity: S
  - Status 2026-06-04: delivered. Active documentation now states that
    `package.json`, `extension/manifest.json`, `extension/ytkit.js`,
    `YTKit.user.js`, and `package-lock.json` are the product-version sources and
    agree at v4.46.0. The v5/v6 labels in `COMPLETED.md`,
    `RESEARCH_REPORT.md`, `docs/architecture.md`, and the archived dossier are
    explicitly marked as legacy internal planning-track labels, not shipped
    release versions.
- [x] P1 — Add per-permission justification + single-purpose store note for review
  - Why: the extension requests `cookies` + `downloads`; the source/full-profile
    manifest carries 19 host origins spanning YouTube, SponsorBlock, Return
    YouTube Dislike, Cobalt, three AI providers (OpenAI/Anthropic/Gemini),
    Reddit, and seven `127.0.0.1` companion ports, while store-safe artifacts
    strip the full-only grants down to 8 hosts.
    Chrome Web Store MV3 policy flags "toolbars that provide a broad array of
    functionality" and requires a written justification per sensitive permission;
    missing/insufficient justification is a top rejection cause.
  - Evidence: `extension/manifest.json` `permissions` (`cookies`, `downloads`,
    `unlimitedStorage`) and full-profile `host_permissions`; `build-extension.js`
    store-safe profile output; CWS MV3 program policy on single-purpose +
    permission justification. [Verified]
  - Touches: `docs/cws-submission-checklist.md`, a new "permissions rationale"
    doc section; manifest unchanged.
  - Acceptance: each requested permission and host origin has a one-line, copy-
    paste store justification, and the single-purpose statement explains why the
    feature set is one product, not a toolbar.
  - Verify: checklist review against the published CWS field requirements.
  - Complexity: S
  - Status 2026-06-04: delivered. `docs/store-permission-rationale.md` now
    contains the copy-paste single-purpose statement, data-handling statement,
    manifest permission justifications, store-safe host justifications, and
    GitHub-full-only host justifications. `docs/cws-submission-checklist.md`
    links that doc as the CWS source of truth and clarifies that public stores
    should receive the store-safe package. `tests/hardening.test.js` now fails
    if the rationale stops covering a live manifest permission or generated
    store-safe/GitHub-full host grant.
- [x] P2 — Document the yt-dlp cookie-handling threat model for the companion
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
  - Status 2026-06-04: delivered. `docs/yt-dlp-cookie-threat-model.md` now
    records the GHSA-v8mc-9377-rwjj / CVE-2023-35934 advisory baseline, current
    `yt-dlp==2026.3.17` pin, extension cookie bridge, YouTube-only domain
    allowlist, `/download` payload/field caps, per-download Netscape cookie jar,
    `--cookies` invocation, finally-block deletion, stale-jar sweep, and
    residual local-machine risk. `astra_downloader/test_astra_downloader.py`
    now pins the doc against those live mitigation names.
- [x] P2 — Disclose Return-YouTube-Dislike estimate accuracy in the UI
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
  - Status 2026-06-04: delivered. Extension RYD count pills and the userscript
    count span now render a compact `est.` affordance, title copy, and
    `aria-label` explaining that Return YouTube Dislike counts are estimates
    after YouTube removed public dislike totals and that low-traffic videos can
    be less accurate. The ratio label/bar also discloses that it uses estimated
    counts, locale seed descriptions now say "estimated dislike count", and the
    hardening suite pins extension, userscript, locale, and cleanup coverage.

### Larger Bets

- [x] P0 — Standing migration test for the 362-key settings schema across versions
  - Why: settings are 362 flat keys with `unlimitedStorage`; a botched
    add/rename/remove silently drops or corrupts user config on upgrade. A
    round-trip test exists (`settings-migration-roundtrip.test.js`) but there is
    no test that loads a *pinned old-version settings blob* and asserts a clean,
    lossless migration forward — the highest data-loss risk in the product.
  - Evidence: `extension/default-settings.json` (362 keys);
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
  - Status 2026-06-04: delivered. `tests/fixtures/settings-legacy-v1-full-profile.json`
    now pins a v1 full-profile snapshot with every current default key, explicit
    migration overrides, explicit future-default classifications, and retired
    keys. `tests/settings-migration-roundtrip.test.js` loads the fixture and
    proves each key is preserved, defaulted, overridden by migration, or
    intentionally dropped.
- [x] P1 — Settings import/export with schema-validated round-trip and scrub
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
  - Status 2026-06-04: delivered. Popup and in-page settings backups now emit a
    schema-validated `exportVersion: 4` payload with settings-schema version,
    active profile, scrubbed-key, and profile-defaulted-key metadata. Both
    import paths migrate first, then reject unknown, unsafe, or type-mismatched
    settings before writing storage. `policy-profile.js` now owns the shared
    validator and schema-only export mode; userscript output is synced; hardening
    tests prove credential fields are absent and schema-only exports validate.
- [ ] P1 — Cross-browser parity gate: Firefox MV3 smoke before each AMO submission
  - Why: Enhancer for YouTube's Firefox build has suffered extended non-functional
    periods — the clearest competitive opening is reliable Firefox parity. The
    repo patches the manifest for Gecko (`scripts/manifest-patch.js`) but nothing
    exercises the Firefox build; MV3 `scripting.executeScript` and service-worker
    behavior diverge from Chromium.
  - Evidence: `scripts/manifest-patch.js` `browser_specific_settings.gecko`;
    `extension/background.js` service worker; Enhancer-for-YouTube Firefox
    reliability reports; the existing Firefox-149 audit item under Existing
    Planned Work (this complements, does not duplicate, it); Mozilla documents
    Firefox MV3 platform differences
    (https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/),
    `web-ext lint` as the pre-submission source check
    (https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/),
    and signed release/beta distribution requirements
    (https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).
    Local gap: `tests/hardening.test.js` only asserts the patcher transforms the
    manifest, `.github/workflows/build.yml` runs `npm test`, `npm run check`, and
    `npm run build:userscript`, and `docs/firefox-executescript-preflight.md`
    records no local Firefox runtime for a browser-console run. [Verified]
  - Touches: `.github/workflows/`, `package.json`, `scripts/`, release checklist.
  - Acceptance: CI or a release-blocking workflow builds the store-safe and
    GitHub-full Firefox artifacts, extracts or stages the patched manifests,
    runs a pinned `web-ext lint --source-dir <firefox-stage>` check for both,
    and launches at least the store-safe artifact in a clean Firefox profile
    against a stable YouTube URL with startup/load errors captured. GitHub-full
    may be lint-only unless the local companion path is explicitly started in the
    job. The smoke output records Firefox version, artifact profile, manifest
    version, gecko ID, and whether the background script loaded without console
    errors.
  - Verify: a deliberately Chromium-only manifest key, a reverted
    `background.service_worker` Firefox patch, or a removed
    `browser_specific_settings.gecko.id` must turn the Firefox gate red before
    release upload.
  - Complexity: M
- [x] P2 — First-run onboarding + empty/permission states for the companion path
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
  - Status 2026-06-04: delivered. The popup first-run card now explains
    Store-Safe versus GitHub-Full, records the chosen `githubFullProfile`, and
    names the local downloader in GitHub-Full copy. The content-script install
    prompt exposes install/retry/check actions with labelled controls, the
    Downloads pane renders an Astra Downloader status banner and setup/retry
    actions, the popup can re-enable dismissed install prompts and trigger the
    companion `/update` bridge, and the download history/health panels show
    explicit unreachable states. Hardening coverage pins the welcome card,
    prompt recovery, update action, health, and history-offline paths.
- [ ] P2 — WCAG 2.2 AA audit pass for in-page overlays (beyond the popup)
  - Why: `audit:a11y` and `audit:contrast` gate the popup, but the in-page
    overlays (theater split, transcript, notes, subscription manager, toasts) are
    not under an automated a11y gate. WCAG 2.2 AA adds focus-appearance and
    target-size criteria that overlay controls commonly fail.
  - Evidence: `scripts/audit-popup-a11y.js` scope is the popup only; in-page
    overlays render from `extension/ytkit.js` / `features/*`;
    `docs/screen-reader-smoke.md` exists but is manual; W3C WCAG 2.2 Target
    Size (Minimum) requires 24x24 CSS px targets or qualifying spacing
    (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), and
    Focus Appearance defines minimum visible focus area/contrast
    (https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).
    Local targets: `extension/core/toast-dom.js` and the inline fallback build
    `.ytkit-global-toast`; `extension/ytkit.js` renders the download options
    dialog, local downloader install prompt, transcript viewer panel,
    transcript-search dialog, `videoNotes` panel, subscription groups toolbar /
    digest panel, and download health/history panels.
    [Verified]
  - First-pass assertions:
    - Every dialog-like overlay has `role="dialog"` plus either `aria-label` or
      `aria-labelledby`; modal overlays also set `aria-modal="true"` and own an
      Escape close path.
    - Every icon-only or close/action button has visible text or an `aria-label`.
    - Focusable overlay controls have a `:focus-visible` rule and do not leave
      hidden panels focusable.
    - Overlay buttons, chips, and close affordances meet the WCAG 2.2 24x24 CSS
      px target-size minimum through explicit size, padding, or spacing.
    - Toasts keep `role="status"` / `aria-live="polite"` for informational
      messages, `role="alert"` / assertive live regions for errors, focusable
      actions, and no dialog-style announcement on auto-dismiss.
  - Touches: `scripts/`, `tests/`, overlay render paths in `features/*`.
  - Acceptance: `npm run audit:a11y` is generalized or paired with
    `npm run audit:overlays` so the popup audit and overlay audit run in
    `npm run check`. The overlay audit covers the targets above, emits a concise
    per-overlay report, and fails on missing names, missing focus-visible rules,
    invalid live-region semantics, or target-size regressions. If a target cannot
    be statically rendered yet, the blocker and manual screen-reader line are
    recorded in `docs/screen-reader-smoke.md`.
  - Verify: run the new audit with one intentionally unlabeled close button, one
    missing `:focus-visible` rule, and one sub-24px action target; each mutation
    must turn the gate red.
  - Complexity: L
- [x] P3 — Diagnostics export bundle for bug reports
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
  - Status 2026-06-04: delivered. Popup Diagnostics now saves an
    `astra-deck-diagnostics-*.json` bundle with an `astraDeckBugReport` marker,
    manifest/browser metadata, sanitized settings, capability map, service-worker
    lifecycle ring, and diagnostic ring. BYO keys, endpoint URLs, custom CSS, and
    credential-like settings are redacted before export, the bug report template
    asks users to attach the generated bundle, and hardening coverage pins the
    payload, redaction, and template wiring.
