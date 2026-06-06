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

> Last researched: Cycle 44 - 2026-06-06.

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
  - Evidence: `scripts/build-selector-fixtures.js` now registers the existing
    `YouTube.mhtml`, `WatchPage.mhtml`, and `LiveChat.mhtml` captures across
    `appShell`, `feed`, `feedCard`, `leftNav`, `media`, `nav`,
    `notifications`, `search`, `shortsShelf`, `thumbnail`, `mainVideo`,
    `player`, `playerChrome`, `playerSettings`, and `liveChat`, then adds
    capture IDs for public Shorts, search-results, channel, and embed-player
    raw captures. The selector regression fails if a registered capture ID has
    no matched stable selector. History, watch later, and the open
    notifications menu remain missing because this automation profile did not
    expose authenticated feed/menu state. `channel.feed`,
    `embed.playerChrome`, `embed.playerSettings`, `sidebar`,
    `relatedSidebar`, and `watch` are intentionally not promoted until a
    capture proves their stable selector chains. [Verified]
  - Capture matrix:
    - `mhtml/Shorts.mhtml` -> `shortsShelf`, `media`, `thumbnail`.
      _(Captured/proven 2026-06-05.)_
    - `mhtml/SearchResults.mhtml` -> `search`, `feedCard`, `thumbnail`, `nav`.
      _(Captured/proven 2026-06-05.)_
    - `mhtml/Channel.mhtml` -> `profile` / `channelProfile`, `feedCard`,
      `thumbnail`. `feed` remains unpromoted until a channel capture proves a
      stable feed selector match. _(Captured/partially proven 2026-06-05.)_
    - `mhtml/History.mhtml` -> `feed`, `feedCard`, `thumbnail`, `appShell`.
    - `mhtml/WatchLater.mhtml` -> `feed`, `feedCard`, `thumbnail`, `leftNav`.
    - `mhtml/EmbedPlayer.mhtml` -> `player`, `mainVideo`. `playerChrome` and
      `playerSettings` remain unpromoted until the capture proves opened chrome
      / settings controls. _(Captured/partially proven 2026-06-05.)_
    - `mhtml/NotificationsMenu.mhtml` -> `notifications`, `nav`, `appShell`.
  - Touches: `mhtml/`, `tests/fixtures/*.tokens.txt`,
    `tests/fixtures/selector-surface-matches.json`,
    `scripts/build-selector-fixtures.js`, `tests/selector-regression.test.js`,
    `docs/selector-fixture-workflow.md`, affected selector-pack metadata.
  - Acceptance: the fixture builder registers every matrix capture, emits a
    committed token file per capture, extends `SURFACE_MATCH_SOURCES` to the
    high-churn packs above, and fails the selector test when a registered
    surface has no matched stable selector or a release-blocking required
    selector is unmatched. Raw `.mhtml` files remain gitignored; only derived
    fixtures and metadata are committed. _(Progress 2026-06-05: the existing
    home/watch/live-chat captures cover 15 proven surfaces; new public
    `Shorts`, `SearchResults`, `Channel`, and `EmbedPlayer` captures now emit
    committed token fixtures and multi-capture selector-match proofs. History
    and Watch Later probes were account-gated in this profile, and the open
    notifications menu still needs a clicked/menu-state capture.)_
  - Verify: `npm run build:fixtures`,
    `node --test tests/selector-regression.test.js`, then inspect
    `tests/fixtures/selector-surface-matches.json` for registered surfaces with
    no matched stable selector. If a capture is blocked by auth or YouTube
    rollout state, record the surface-specific blocker in
    `docs/selector-fixture-workflow.md`.
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

### Researcher Queue (Cycle 25 - 2026-06-04)

- [x] 🔬 `companion-install-docs-2026-06-04` - inspected README install and
  release-output sections, companion download copy, Deno / PO-token prerequisite
  docs, signed-installer and self-update roadmap rows, signing-key publication
  docs, latest release asset state, and official release / helper-install
  guidance. Detailed notes live in
  `docs/research-cycle-25-companion-install-docs.md`.
- [x] P2 - 🔬🤖 Document the Astra Downloader companion install and release-asset path
  - Why: README installation covers extension and userscript paths, then later
    says downloads use the Astra Downloader companion. Users need a truthful
    setup section that explains the current companion state, release asset
    availability, prerequisites, and how this differs from the signed
    installer/MSI and self-update release-channel work.
  - Evidence: `README.md:26-55` covers extension/userscript install only;
    `README.md:135` says downloads use Astra Downloader; `README.md:137-171`
    explains PO-token and Deno prerequisites without a parent companion install
    section; `README.md:367-373` lists release outputs without
    `AstraDownloader.exe` or `.sha256`; `ROADMAP.md:108-118` keeps
    `APP_VERSION` frozen until a matching companion binary release exists;
    `ROADMAP.md:151-156` keeps signed installer/MSI open; Cycle 22 queues
    EXE/sidecar release-channel proof; `ROADMAP.md:1616-1638` says in-app
    companion setup prompts shipped; `docs/signing-keys.md:217-229` documents
    CRX/XPI publication paths but not companion setup; latest release `v4.46.0`
    lacks `AstraDownloader.exe` and `AstraDownloader.exe.sha256`. [Verified]
  - Touches: `README.md`, `docs/signing-keys.md`, possibly a companion setup doc
    under `docs/`, and release notes/checklist text once the EXE asset exists.
  - Acceptance: README has a distinct Astra Downloader companion setup section;
    it truthfully states whether the latest release contains a companion EXE and
    hash sidecar; it links or describes the in-app setup prompt, Deno runtime,
    and PO-token provider prerequisites without implying they are browser
    extension installs; the release-output list mentions companion assets only
    when the Cycle 22 release-channel item ships, or explicitly labels them as
    pending; the signed installer/MSI caveat remains separate.
  - Verify: `rg -n "Astra Downloader|AstraDownloader.exe|Deno|PO Token"
    README.md docs/signing-keys.md docs`; `gh release view --json assets`;
    `npm run check`; docs-only diff review confirms no feature source, build
    file, manifest, runtime config, or generated artifact changed unless paired
    with the actual release-asset implementation.
  - Status 2026-06-05: shipped. README now has a standalone Astra Downloader
    companion setup section, explicitly states that latest release `v4.46.0`
    lacks `AstraDownloader.exe` and `AstraDownloader.exe.sha256`, documents the
    current Windows source-checkout launch path, links the Downloads feature
    note back to that setup section, and frames PO-token/Deno setup as
    companion prerequisites rather than browser extension install steps.
    `docs/signing-keys.md` now requires README/release notes to keep the pending
    companion-asset caveat until both EXE and sidecar assets exist. A hardening
    regression pins the docs contract. The Cycle 22 release-channel proof and
    signed installer/MSI item remain open.
  - Complexity: S

### Researcher Queue (Cycle 36 - 2026-06-06)

- [x] `authenticated-capture-helper-safety-2026-06-06` - implemented the
  helper-only first slice from Cycle 35 and documented it in
  `docs/research-cycle-36-authenticated-capture-helper-safety.md`.
  - Source changes: `scripts/capture-watch-mhtml.js` now has `history`,
    `watch-later`, and `notifications` profiles; `--user-data-dir` and
    `ASTRA_CAPTURE_PROFILE_DIR`; absolute external profile requirements for
    authenticated surfaces; repo-path refusal before Chrome launch; signed-in /
    populated-content probes; notification-menu opening before snapshot; and
    one-line parse-time safety errors. [Verified]
  - Safety/test changes: `.gitignore` now blocks `.auth/`,
    `playwright/.auth/`, `capture-profiles/`, and `*.storageState.json`.
    `tests/selector-regression.test.js` now asserts the helper docs, help text,
    ignore guards, missing-auth failure, relative-path refusal, repo-local path
    refusal, and env-var path refusal without launching Chrome. [Verified]
  - Documentation: `docs/selector-fixture-workflow.md` now describes the
    authenticated CDP capture path and states that fixture-builder
    registrations must wait until a maintainer-local populated capture proves
    stable selector matches. [Verified]
  - Verification: `node --check scripts/capture-watch-mhtml.js`,
    `node --check scripts/build-selector-fixtures.js`,
    `node --test tests/selector-regression.test.js`, and a real
    `npm run capture:surface -- --surface history` negative check via
    `cmd pushd` over the UNC path. The npm check returned non-zero with the
    expected one-line auth-required message. [Verified]
  - Non-goals: no raw authenticated MHTML was captured, no fixture-builder
    registrations or `selector-surface-matches.json` rows were added, no
    selector-pack provenance was promoted, no hosted settings changed, and no
    commit/push happened.

### Researcher Queue (Cycle 35 - 2026-06-06)

- [x] `authenticated-capture-implementation-plan-2026-06-06` - turned the
  Cycle 32 authenticated/menu-state capture lane into a code-level
  implementation contract in
  `docs/research-cycle-35-authenticated-capture-implementation-plan.md`.
  This pass inspected the current CDP helper, fixture builder, selector
  regression, workflow docs, `.gitignore`, package scripts, and the
  `notifications`, `feed`, `feedCard`, and `leftNav` selector packs. No raw
  MHTML, auth state, hosted settings, release assets, commits, or source
  implementation changes were made.
  - Implementation finding: the current helper only has public profiles
    (`watch`, `search`, `shorts`, `channel`, `embed`) and always launches a
    temporary Chrome profile. Because it is a raw CDP helper, the first
    authenticated slice should prefer `--user-data-dir <absolute external
    profile>` / `ASTRA_CAPTURE_PROFILE_DIR` over Playwright storage-state,
    while leaving storage-state as a later option if the helper migrates to
    Playwright contexts. [Verified]
  - Safety contract: authenticated profiles must be absolute, external to the
    worktree, rejected when under `.git`, `mhtml`, `tests/fixtures`,
    `playwright/.auth`, `.auth`, or any repo path, and omitted from success
    JSON output. Missing auth, empty Watch Later, generic signed-out History,
    or unopened/empty notifications menu must fail before writing a fixture.
    [Verified]
  - Fixture/test contract: add `History.mhtml`, `WatchLater.mhtml`, and
    `NotificationsMenu.mhtml` registrations only atomically with derived
    `yt-history.tokens.txt`, `yt-watch-later.tokens.txt`,
    `yt-notifications-menu.tokens.txt`, and `selector-surface-matches.json`
    rows proving stable matches for `history.*`, `watchLater.*`, and
    `notifications.menu` capture IDs. [Verified]
  - Roadmap impact: the existing P2 implementation item remains open, but its
    next implementation order is now explicit: helper CLI/safety guards first,
    negative auth/safety checks second, maintainer-local positive captures
    third, then fixture-builder/test/selector-pack promotion.

### Researcher Queue (Cycle 34 - 2026-06-06)

- [x] 🔬 `hosted-policy-runbook-2026-06-06` - converted the Cycle 33 hosted
  policy closure plan into `docs/hosted-policy-closure.md`, refreshed read-only
  hosted state with `GH_PROMPT_DISABLED=1`, inspected the workflow action
  inventory, and updated `docs/repo-settings.md` with the 2026-06-06 snapshot.
  The runbook deliberately does not mutate repository settings or upload
  release assets.
  - Current hosted evidence: Actions remain enabled with `allowed_actions: all`
    and `sha_pinning_required: false`; workflow token defaults remain read-only
    with PR approval disabled; the repository is public; Dependabot security
    updates remain disabled; dependency graph status is not exposed in the
    returned `security_and_analysis` block; `main` still requires one approving
    review but not code-owner reviews; the default-branch CODEOWNERS errors API
    still returns `404` until `.github/CODEOWNERS` lands on `main`; release
    `v4.46.0` has 12 assets and still lacks `AstraDownloader.exe` plus
    `AstraDownloader.exe.sha256`. [Verified]
  - Workflow policy finding: all workflow `uses:` refs are full 40-character
    SHAs with same-line version comments. The only non-GitHub-owned action is
    `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`,
    so the selected-actions allowlist must include that exact pinned ref before
    `allowed_actions: selected` is enforced. [Verified]
  - Roadmap impact: the documentation/runbook item is closed, but the hosted
    mutations themselves remain manual-gated: dependency graph / Dependabot
    enablement, Dependency review rerun, CODEOWNERS enforcement, selected
    Actions, SHA-pinning, companion EXE release upload, and headed optional-host
    prompt smoke.

### Researcher Queue (Cycle 33 - 2026-06-06)

- [x] 🔬 `hosted-policy-closure-order-2026-06-06` - inspected the
  repository-settings ledger, open manual-gated roadmap items for dependency
  graph / Dependency review, CODEOWNERS enforcement, and Actions selected /
  SHA-pinning policy, current workflow pinning notes, and GitHub documentation
  for dependency review, CODEOWNERS, Actions permissions, and Actions secure-use
  guidance. Detailed notes live in
  `docs/research-cycle-33-hosted-policy-closure.md`.
- [ ] P1 - 🔬🤖🔧 Add a post-merge hosted policy closure runbook
  - Why: several high-value security controls are intentionally hosted/manual
    after the SHA-clean branch lands on `main`, but they are split across Cycle
    12, Cycle 16, Cycle 21, `docs/repo-settings.md`, and
    `AUTONOMOUS-LOOP-STATE.md`. A future automation pass should not guess the
    order or mutate hosted settings before source-side workflows have proved
    clean under the new branch state.
  - Evidence: `docs/repo-settings.md` records `allowed_actions: all`,
    `sha_pinning_required: no`, dependency graph / Dependabot alert uncertainty,
    CODEOWNERS pending merge to `main`, and a target hosted policy that should
    wait for fresh hosted workflow proof. `ROADMAP.md` keeps open manual-gated
    items for dependency graph before Dependency review, CODEOWNERS branch
    protection, Actions selected-actions / SHA-pinning, companion EXE live
    upload, and manual optional-host prompt smoke. A live `gh api` refresh was
    attempted on 2026-06-06 for Actions permissions, security analysis, branch
    review policy, and the `v4.46.0` release assets, but each command timed out
    after 34 seconds in this environment, so the latest hosted state remains
    unverified in this cycle. GitHub docs state that dependency review becomes
    available when dependency graph is enabled
    (https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review),
    CODEOWNERS enforcement requires enabling "Require review from Code Owners"
    in branch protection after a valid CODEOWNERS file exists
    (https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners),
    Actions permissions can set `allowed_actions: selected` and
    `sha_pinning_required: true`
    (https://docs.github.com/en/rest/actions/permissions), and GitHub's secure
    use guidance says full-length commit SHA pinning is the immutable-action
    option while same-line comments preserve Dependabot context
    (https://docs.github.com/en/actions/reference/security/secure-use).
    [Verified]
  - Touches: `docs/repo-settings.md`, `ROADMAP.md`,
    `AUTONOMOUS-LOOP-STATE.md`, and possibly a new `docs/hosted-policy-closure.md`
    or equivalent runbook. Hosted GitHub settings must remain maintainer-gated.
  - Acceptance: one tracked runbook names the exact safe order:
    1) refresh hosted state with read-only `gh api` / `gh release view` checks;
    2) enable dependency graph / Dependabot alerts where available and rerun the
    Dependency review PR check; 3) after CODEOWNERS exists on `main`, validate
    the default-branch CODEOWNERS API and enable code-owner review; 4) after
    hosted Validate, Build & Release dry-run or tag run, yt-dlp Smoke, and
    CodeQL pass on pinned workflow refs, change Actions to selected sources and
    require full-length SHA pins; 5) rerun the hosted checks and record exact
    check names / API outputs in `docs/repo-settings.md`. The runbook must also
    state that no companion release upload or repository setting mutation should
    occur without maintainer intent in that run.
  - Verify: read-only `gh api` checks return non-timeout JSON; the runbook's
    command list contains no token values or destructive branch operations;
    `rg -n "dependency graph|require_code_owner_reviews|sha_pinning_required|selected-actions|AstraDownloader.exe"`
    finds the closure order in one tracked place; roadmap continuation state
    points future autonomous runs to the runbook before any hosted mutation.
  - Status 2026-06-06: delivered as `docs/hosted-policy-closure.md`. The
    runbook records the current read-only hosted snapshot, source-state
    preconditions, dependency graph / Dependency review order, CODEOWNERS
    enforcement order, selected Actions / SHA-pinning order, the required
    `browser-actions/setup-firefox` allowlist exception, and the explicit
    boundary that companion EXE release assets stay in the separate release
    channel item.
  - Complexity: S/M

### Researcher Queue (Cycle 32 - 2026-06-06)

- [x] 🔬 `authenticated-selector-capture-lane-2026-06-06` - inspected the
  current CDP capture helper, selector fixture builder, selector workflow docs,
  capture-week roadmap row, loop state, architecture residue note, and external
  documentation for CDP MHTML snapshots and authenticated browser-state reuse.
  Detailed notes live in
  `docs/research-cycle-32-authenticated-selector-captures.md`.
- [ ] P2 - 🔬🤖 Add authenticated/menu-state selector capture lane for History,
  Watch Later, and notifications
  - Why: the public capture matrix now covers home, watch, live chat, Shorts,
    search results, channel, and embed player, but the remaining high-churn
    surfaces are account or menu-state dependent. Re-running public CDP captures
    cannot prove History, Watch Later, or an opened notifications menu, so the
    next fixture-quality jump needs an explicitly safe authenticated capture lane
    rather than more unauthenticated retries.
  - Evidence: `scripts/capture-watch-mhtml.js` currently defines capture
    profiles for `watch`, `search`, `shorts`, `channel`, and `embed`, with no
    `history`, `watch-later`, or `notifications` profile. `docs/selector-fixture-workflow.md`
    says `mhtml/History.mhtml`, `mhtml/WatchLater.mhtml`, and
    `mhtml/NotificationsMenu.mhtml` still need manual or authenticated capture;
    the same doc records that unauthenticated CDP probes settled on `ytd-app`
    without exposing feed-card / playlist-card selectors and that notifications
    requires opening the menu before capture. `AUTONOMOUS-LOOP-STATE.md` records
    the same Cycle 31 blocker. Chrome DevTools Protocol documents
    `Page.captureSnapshot` as MHTML serialization that includes iframes, shadow
    DOM, external resources, and inline styles
    (https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureSnapshot).
    Playwright's authentication docs recommend storing authenticated browser
    state in a gitignored directory and warn that browser state can contain
    sensitive cookies / headers that could impersonate the user
    (https://playwright.dev/docs/auth). [Verified]
  - Touches: `scripts/capture-watch-mhtml.js`,
    `scripts/build-selector-fixtures.js`, `tests/selector-regression.test.js`,
    `tests/fixtures/*.tokens.txt`, `tests/fixtures/selector-surface-matches.json`,
    `docs/selector-fixture-workflow.md`, `docs/architecture.md`, and selector
    packs for `feed`, `feedCard`, `thumbnail`, `leftNav`, `notifications`,
    `nav`, and `appShell`.
  - Acceptance: the capture helper supports explicit profiles for
    `history`, `watch-later`, and `notifications`; authenticated capture uses a
    caller-provided profile or auth-state path that is outside the repo and
    refuses paths under the worktree; docs require the auth/profile directory to
    be gitignored and never committed; notification capture opens the
    topbar/menu state before snapshot; unauthenticated or expired-auth runs fail
    with a clear "auth required" result instead of generating false fixtures;
    fixture builder registration remains opt-in until each raw capture proves at
    least one stable selector; raw `.mhtml` and auth state remain untracked; and
    roadmap/audit notes record which capture mode produced each surface.
  - Verify: `node --check scripts/capture-watch-mhtml.js`; a dry run without
    auth fails clearly for `history` / `watch-later`; a maintainer-run
    authenticated capture emits the three raw MHTML files; `npm run
    build:fixtures`; `node --test tests/selector-regression.test.js`;
    `git status --ignored -- mhtml playwright .auth` confirms no auth state or
    raw MHTML is staged; `selector-surface-matches.json` shows stable matches
    for the new capture IDs before selector packs are promoted.
  - Status 2026-06-06: Cycle 35 refined this into an implementation contract in
    `docs/research-cycle-35-authenticated-capture-implementation-plan.md`.
    Work the helper CLI/safety slice before adding builder registrations, then
    add derived fixtures and selector-pack provenance only after a
    maintainer-local populated capture proves stable matches.
  - Status 2026-06-06: Cycle 36 delivered the helper CLI/safety slice. The
    remaining scope is positive maintainer-local captures, derived token
    fixtures, `SURFACE_MATCH_SOURCES` registrations for authenticated capture
    IDs, selector-regression required matches, and selector-pack provenance
    updates after stable matches are proven.
  - Complexity: M

### Researcher Queue (Cycle 24 - 2026-06-04)

- [x] 🔬 `retired-options-page-copy-2026-06-04` - inspected the retired
  options-page contract, manifest settings surface, runtime summary-provider
  error path, README settings-panel guidance, hardening tests, shipped extension
  files, and Chrome / Mozilla / accessibility guidance for extension UI and
  actionable error copy. Detailed notes live in
  `docs/research-cycle-24-retired-options-copy.md`.
- [x] P2 - 🔬🤖 Replace retired options-page runtime copy with current settings-panel guidance
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
  - Status 2026-06-05: delivered. The `aiVideoSummary` missing-key error now
    points users to Astra Deck settings via the YouTube gear icon or toolbar
    popup `Open Full Settings` action, `node sync-userscript.js` confirmed the
    userscript bundle remained aligned, and `tests/hardening.test.js` now fails
    if shipped runtime code reintroduces `via options page` guidance.

### Researcher Queue (Cycle 23 - 2026-06-04)

- [x] 🔬 `repo-working-notes-drift-2026-06-04` - inspected the repo-local
  instruction chain, `CLAUDE.md` current/historical sections, release policy,
  Firefox support claims, signing-key release checklist, architecture map, CWS
  / AMO checklist, manifest patch, current branch-protection behavior, and
  official GitHub / Mozilla / Chrome guidance. Detailed notes live in
  `docs/research-cycle-23-repo-working-notes-drift.md`.
- [x] P2 - 🔬🤖 Reconcile repo-local working notes with current release and browser-support contracts
  - Why: future repo work starts from `AGENTS.md`, which delegates to
    ignored local `CLAUDE.md`; that file referenced a missing handoff log, included stale
    Firefox 128+ statements, and describes direct `main` push / `gh release
    create` release flow even though protected `main`, local `ytkit.pem`
    signing, profile-split release artifacts, and Firefox 142+ data-consent
    requirements are the current contract.
  - Evidence: `AGENTS.md:1-7` delegates repo working notes to `CLAUDE.md`;
    `CLAUDE.md:3-4` points at `CODEX-CHANGELOG.md`, while `Test-Path
    CODEX-CHANGELOG.md` returns `False`; `CLAUDE.md:68-76` says to push `main`,
    run `gh release create`, and require Firefox 128+; `CLAUDE.md:382-385`,
    `:706-708`, and `:884-889` present old five-artifact / v3.20.x state in
    historical sections; and `CLAUDE.md:432-435` repeats
    `strict_min_version: 128.0`. Current sources instead say Firefox 142+ and
    maintainer-local release publication: `scripts/manifest-patch.js:7` and
    `:18-24`, `README.md:49` and `:342-344`, `docs/architecture.md:7`,
    `docs/cws-submission-checklist.md:170-174`, and
    `docs/signing-keys.md:185-193` / `:198-215`. `docs/architecture.md:127`
    still has related release-flow drift already covered by Cycle 14. [Verified]
  - Touches: tracked `AGENTS.md`, Cycle 23 planning ledgers, and an optional
    docs-drift check if the implementer wants one. `CLAUDE.md` is intentionally
    ignored local scratch.
  - Acceptance: the committed first-read instructions no longer depend on a
    missing handoff log or ignored local notes for the current contract; tracked
    docs direct workers to branch/PR publication for protected `main`, local
    `ytkit.pem` signing, eight profile-split extension artifacts, userscript,
    SBOM, manifest/checksum assets, and the separate companion EXE release item;
    current browser-support docs say Firefox 142+ for extension artifacts and
    reference `scripts/manifest-patch.js` data-consent behavior; old v3/v4 local
    notes are either optional scratch or historical context rather than the
    committed source of truth; the Cycle 14 release-doc item is cross-linked so
    `docs/architecture.md` no longer contradicts the signing-key release policy.
  - Verify: `git check-ignore -v -- CLAUDE.md` confirms `CLAUDE.md` is local
    ignored scratch; `rg -n "CLAUDE.md.*source of truth|CODEX-CHANGELOG|strict_min_version: \"128\\.0\"|Firefox 128|Firefox 128\\+|push main|gh release create|All 5 artifacts|all 5 artifacts|Five-artifact|five-artifact" AGENTS.md`
    returns no stale tracked first-read guidance; `rg -n
    "AUTONOMOUS-LOOP-STATE|ROADMAP.md|RESEARCH_REPORT.md|docs/signing-keys.md|docs/audit|optional local context"
    AGENTS.md` finds the current tracked handoff; `node scripts/check-versions.js`;
    and docs-only diff review confirms no feature source or generated artifact
    changed unless a docs-drift check was deliberately added.
  - Status 2026-06-05: shipped. `AGENTS.md` now points at tracked loop,
    changelog, completed-work, roadmap, research, architecture, signing-key, and
    audit files instead of delegating source-of-truth status to ignored local
    `CLAUDE.md`; it labels `CLAUDE.md` as optional local scratch. Current release
    and Firefox contracts remain in tracked README, architecture, signing-key,
    CWS/AMO, and manifest-patch docs. Detailed implementation notes live in
    `docs/audit/2026-06-05-repo-working-notes.md`.
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
  - Status 2026-06-05: code-side release-channel enforcement shipped locally.
    `scripts/stage-companion-release.js` stages a validated EXE into `build/`,
    `npm run release:manifest -- --require-companion` requires
    `AstraDownloader.exe` plus `.sha256`, and `/update` now fails before
    scheduling replacement when the sidecar is unavailable. Verified with a
    real `py -3.12 astra_downloader/build.py` PyInstaller output and a local
    companion-required manifest/hash check. The live GitHub Release upload and
    `gh release download` dry-run remain open maintainer release actions; this
    item stays open until the public release contains both companion assets.
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
  - Status 2026-06-05: source-side CODEOWNERS coverage now exists on the
    feature branch. `.github/CODEOWNERS` maps repository policy, dependency
    manifests, release/signing tooling, hardening gates, security/privacy docs,
    extension manifest/background/core code, and the companion downloader to
    `@SysAdminDoc`; `tests/hardening.test.js` now asserts those high-risk paths
    remain covered and avoids non-existent team references. GitHub's
    CODEOWNERS errors API returned `errors: []` for
    `ref=codex/research-feature-plan-2026-06-05`. The item stays open until the
    CODEOWNERS file lands on `main`, the errors API is clean for the default
    branch, and `main` branch protection enables code-owner review.
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
  - Evidence: original Cycle 20 research found `extension/manifest.json:31`
    defined install-time
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
  - Status 2026-06-05: first implementation slice shipped for default-off
    store-safe enrichment hosts. `extension/core/data-flow.js` now marks
    `i.ytimg.com`, Return YouTube Dislike, and Reddit as `runtime-optional`;
    `build-extension.js` emits those hosts in `optional_host_permissions` for
    store-safe Chrome/Firefox artifacts while keeping them in CSP connect-src;
    `extension/core/optional-host-permissions.js` plus `popup.js` request
    declared optional hosts before enabling matching settings; and hardening
    tests pin the manifest split, data-flow coverage, popup request guard, and
    helper callback/promise behavior. A second same-day slice added background
    `EXT_FETCH` enforcement so requests to generated runtime-optional origins
    must pass the existing allowlist and a current `chrome.permissions.contains`
    grant check before network fetch. A third same-day slice added popup
    grant-state refresh, `permissions.onAdded`/`onRemoved` listeners,
    permission-needed chips on quick toggles and schema rows, data-flow
    granted/needed labels, and exact permission-denied status copy. A fourth
    same-day slice moved `sponsor.ajay.app` into store-safe
    `optional_host_permissions` and added a popup Grant access banner so
    default-on SponsorBlock can request the shared SponsorBlock/DeArrow origin
    from an explicit user gesture. A fifth same-day slice added
    `npm run smoke:optional-hosts`, which stages the store-safe Chromium
    manifest, loads the real popup in a fresh Chromium-family profile, seeds
    enabled optional enrichment features, and verifies the pre-grant Grant
    access banner lists all five missing optional origins. Managed Google
    Chrome on this PC blocks `--load-extension`, so the smoke falls back to
    Edge. A sixth same-day slice added headed Chromium prompt-state modes:
    `--headed --expect-deny` asserts the denied-prompt state leaves missing
    grants visible with explicit host-access copy, and `--headed
    --attempt-grant --revoke-after-grant` accepts the prompt, removes the
    optional origins through `chrome.permissions.remove()`, and verifies the
    popup returns to the permission-needed state. Chromium grant/deny/revoke
    smoke is now scriptable, but the native headed browser prompts still need a
    release operator run before tagging. Cycle 38 added a Firefox headed
    operator harness: `npm run smoke:firefox -- --headed
    --manual-optional-hosts` maps the staged Gecko id to a stable
    `moz-extension://` popup URL, opens the popup and YouTube smoke page, prints
    expected optional origins, and keeps Firefox headed for accept/deny/revoke
    checks. A native Firefox prompt result is still not claimed until a machine
    with Firefox installed runs that command.
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
    `npm run smoke:optional-hosts` proves Chromium pre-grant prompt readiness.
    Headed Chrome/Edge and Firefox store-safe smoke checks should prove each
    optional feature prompts once, works after grant, and degrades after revoke.
  - Complexity: M

### Researcher Queue (Cycle 19 - 2026-06-04)

- [x] 🔬 `codeql-code-scanning-gate-2026-06-04` - inspected current
  workflows, code-scanning default setup, extension trust boundaries, Python
  companion subprocess/Flask paths, and current static-analysis docs. Detailed
  notes live in `docs/research-cycle-19-code-scanning.md`.
- [x] P1 - 🔬🤖 Enable CodeQL code scanning for JavaScript extension code and the Python companion
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
  - Status 2026-06-05: shipped `.github/workflows/codeql.yml`,
    `.github/codeql.yml`, and a hardening regression pinning the workflow
    contract. Hosted CodeQL push run `27002182993` and pull-request run
    `27002184466` both succeeded for `javascript-typescript` and `python`;
    `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open --jq
    length` returned `0`. CodeQL remains advisory-only until the exact
    protected-branch check contexts are confirmed on `main` or the next PR.
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
- [x] 🔬🤖🔧 P1 — Publish security disclosure policy and enable private vulnerability reporting
  - Why: Astra Deck already had explicit secret-scanning, signing-key, release,
    and dependency-security queues, but before this cycle the public repository
    had no `SECURITY.md` and private vulnerability reporting was disabled. A
    researcher who found a key leak, extension privilege issue, companion
    loopback weakness, or release integrity failure had to use public issues or
    guess a private contact path. That conflicted with the signing-key leak
    runbook, which already referred to adding a `SECURITY.md` section during
    incident response.
  - Historical evidence: `Get-ChildItem -Path . -Force -File` showed no root
    `SECURITY.md`, and `.github/` contained issue templates plus PR/dependency
    workflow config but no security-policy file. `rg -n "SECURITY\.md|security
    policy|private vulnerability|report a vulnerability|security advisory"`
    found release/signing references but no current disclosure instructions.
    `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq
    .` returned `enabled: false`, and `gh api
    repos/SysAdminDoc/Astra-Deck/security-advisories --jq length` returned `0`.
    GitHub docs say a `SECURITY.md` gives instructions for reporting
    vulnerabilities, and private vulnerability reporting gives public-repo
    researchers a structured private path without resorting to public
    disclosure or informal channels. [Verified]
  - Touches: root `SECURITY.md`, `README.md`/`CONTRIBUTING.md` links,
    `docs/signing-keys.md` leak-response wording, `docs/repo-settings.md`, and
    GitHub Settings -> Advanced Security -> Private vulnerability reporting.
  - Status 2026-06-05: shipped root `SECURITY.md`, README/CONTRIBUTING links,
    signing-key leak-response wording, and repository-settings state updates.
    Private vulnerability reporting is enabled through the GitHub repository
    API. Maintainer notification expectations are documented in
    `docs/repo-settings.md`; user-specific watch settings were not modified by
    this repo change.
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
- [x] 🔬🤖🔧 P0 — Move CRX signing key custody out of the repo worktree
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
  - Status 2026-06-05: Shipped. `build-extension.js` now rejects repo-worktree
    external key paths, defaults release builds to the external key contract
    (`ASTRA_CRX_KEY_PATH`, `--crx-key`, or
    `%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem`), and uses an explicit
    `ASTRA_CRX_KEY_MODE=ephemeral` validation mode for CI artifacts. The local
    ignored root key was moved to the default external AppData path without
    printing key material; `Test-Path ytkit.pem` is false and the expected
    public CRX ID is recorded in `docs/signing-keys.md`. Release-time offline
    backup remains a maintainer checklist responsibility before publication.
  - Complexity: M

### Researcher Queue (Cycle 16 - 2026-06-04)

- [x] 🔬 `actions-sha-pinning-policy-2026-06-04` - inspected
  `.github/workflows/*.yml`, `.github/dependabot.yml`, live repository Actions
  permissions, workflow token defaults, and GitHub Actions supply-chain
  hardening / Dependabot documentation. Detailed notes live in
  `docs/research-cycle-16-actions-sha-pinning.md`.
- [ ] 🔬🤖🔧 P2 — Restrict GitHub Actions sources and require repository SHA-pinning policy
  - Why: Astra Deck has release and validation workflows that rely on
    GitHub-hosted actions. The repository currently
    allows all actions and does not require full-length SHA pins, so future
    workflow edits can introduce unreviewed action sources if repository policy
    is not tightened after the source-side pins land. This matters most for
    `Build & Release`, which
    grants `contents: write`, `id-token: write`, and `attestations: write` while
    producing release artifacts and attestations.
  - Evidence: `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq
    "{enabled,allowed_actions,sha_pinning_required,selected_actions_url}"`
    returns `enabled: true`, `allowed_actions: all`,
    `sha_pinning_required: false`, and no selected-actions URL. `gh api
    repos/SysAdminDoc/Astra-Deck/actions/permissions/workflow --jq .` shows the
    default `GITHUB_TOKEN` permission is already `read` and workflows cannot
    create or approve PR reviews by default. The original research cycle found
    17 tag-pinned external action refs across `validate.yml`, `build.yml`, and
    `yt-dlp-smoke.yml`; after the Node 24, CodeQL, and 2026-06-05 SHA-pinning
    passes, the feature branch has 20 external `uses:` refs across
    `validate.yml`, `build.yml`, `yt-dlp-smoke.yml`, and `codeql.yml`, all
    pinned to full 40-character SHAs with same-line version comments. `rg -n
    "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)" .github/workflows` now returns
    no matches. GitHub's secure-use reference says a full-length commit SHA is
    the only immutable action reference, and repository settings can require
    full-length SHA pins. GitHub Actions settings and REST docs also support
    `allowed_actions: selected` plus `github_owned_allowed`,
    `verified_allowed`, and `patterns_allowed`; Dependabot supports
    `github-actions` version updates and same-line version comments for
    SHA-pinned action refs. [Verified]
  - Touches: `.github/workflows/validate.yml`, `.github/workflows/build.yml`,
    `.github/workflows/yt-dlp-smoke.yml`, `.github/workflows/codeql.yml`,
    `.github/dependabot.yml` if the Actions cadence/comment strategy changes,
    repository Actions permissions, and `docs/repo-settings.md`.
  - Acceptance: every external `uses:` entry is pinned to the full
    40-character commit SHA from the action owner's repository, with a same-line
    version comment that preserves Dependabot update context. Repository
    Actions permissions are then changed from `allowed_actions: all` to
    `selected` with
    GitHub-owned actions allowed and broad verified-creator allowance disabled,
    followed by `sha_pinning_required: true`. Any non-GitHub-owned action added
    later must be explicitly named in `patterns_allowed` by repository, tag, or
    SHA.
  - Status 2026-06-05: Source-side SHA pinning shipped for `Validate`, `Build &
    Release`, `yt-dlp Smoke`, and `CodeQL`. Hardening tests now reject mutable
    tag/branch action refs and pin the resolved upstream commits, including
    `actions/dependency-review-action` at its real `v5.0.0` release commit.
    Cycle 39 added `npm run policy:actions`, which scans all workflow `uses:`
    lines, fails if an external action is not pinned to a full SHA or lacks the
    same-line version comment, and emits the exact hosted payload for
    `allowed_actions: selected`, `sha_pinning_required: true`,
    GitHub-owned actions allowed, verified creators disabled, and the pinned
    `browser-actions/setup-firefox` ref as the only `patterns_allowed` entry.
    Remaining scope is the repository settings change itself, plus hosted
    workflow proof after those settings are applied.
  - Verify: `rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)"
    .github/workflows` returns no mutable major-branch action refs, while
    `rg -n "uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v" .github/workflows` lists every
    external action. `npm run policy:actions` emits the selected-actions
    payload and inventory. `node --test tests/hardening.test.js
    --test-name-pattern="GitHub workflows pin|CodeQL scans|release manifest
    generation|validate workflow audits"` passes. `gh api
    repos/SysAdminDoc/Astra-Deck/actions/permissions --jq
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
- [x] 🔬🤖🔧 P0 — Triage and resolve open Google API Key secret-scanning alert
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
  - Status 2026-06-05: Shipped. Alert 1 was resolved as `false_positive` with a
    redacted rationale after triage confirmed the value was an intentional
    public YouTube/Innertube bootstrap fallback rather than a private provider
    credential. Active source and tracked userscript/archive snapshots no
    longer contain Google API-key-shaped literals; transcript Innertube calls
    now require a page-derived key and fall through to other transcript methods
    when unavailable. `gh api .../alerts?state=open --paginate --jq 'length'`
    returned `0`. Form-encoded and JSON attempts to enable validity checks and
    non-provider patterns returned successfully but left both settings
    `disabled`; `docs/repo-settings.md` records that repo-endpoint no-op.
  - Complexity: S

### Researcher Queue (Cycle 14 - 2026-06-04)

- [x] 🔬 `release-doc-contract-reconciliation-2026-06-04` - inspected
  current release workflow, v4.46.0 release assets/digests, tag-run
  attestation steps, signing-key policy docs, architecture CI docs, and stale
  research-report sections. Detailed notes live in
  `docs/research-cycle-14-release-doc-contract-reconciliation.md`.
- [x] 🔬🤖 P2 — Reconcile release automation docs with maintainer-local artifact contract
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
  - Status 2026-06-05: delivered. `docs/architecture.md` now says CI validates,
    builds, uploads `build/*` as workflow artifacts, and creates tag-only
    build/SBOM attestations, while public GitHub Release publication remains
    maintainer-local because `ytkit.pem` never enters CI. `RESEARCH_REPORT.md`
    current status was updated to stop describing the architecture row as stale.

### Researcher Queue (Cycle 13 - 2026-06-04)

- [x] 🔬 `actions-node24-readiness-2026-06-04` - inspected current
  workflow action pins, the latest `Validate` and `Build & Release` logs,
  open Dependabot PRs, GitHub's Node 20 runner deprecation notice, and current
  GitHub-owned action release majors. Detailed notes live in
  `docs/research-cycle-13-actions-node24-readiness.md`.
- [x] 🔬🤖 P1 — Migrate GitHub Actions workflows to Node 24 action majors
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
  - Status 2026-06-05: delivered. Workflow pins now use
    `actions/checkout@v6`, `actions/setup-node@v6`,
    `actions/setup-python@v6`, and `actions/upload-artifact@v7` across
    `validate.yml`, `build.yml`, and `yt-dlp-smoke.yml`. A hardening regression
    keeps the Node 20-era action majors from returning. The later 2026-06-05
    source-side SHA-pinning pass pinned these refs to full commits; repository
    selected-actions / required-SHA enforcement remains open in the Cycle 16
    hosted policy item.

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
  - Status 2026-06-06: source-side guard shipped. The `Dependency review` job
    remains PR-only, but `continue-on-error` is now controlled by repository
    variable `DEPENDENCY_REVIEW_REQUIRED`: unset or non-`true` keeps the job
    advisory while dependency graph setup is unresolved; setting it to `true`
    after hosted proof makes the job enforce the existing
    `fail-on-severity: moderate` policy. Remaining scope is hosted dependency
    graph / Dependabot enablement, rerunning a dependency PR, and setting the
    variable only after the check no longer fails with repository setup text.
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
    also run `actions/dependency-review-action` from the pinned `v5.0.0` commit
    with moderate-or-higher vulnerability failure and license policy disabled
    until a maintainer sets one.

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
    Chrome Limited Use statement. The Firefox path is Firefox 142+ built-in
    data consent: `scripts/manifest-patch.js` raises `strict_min_version` to
    `142.0` and injects required `data_collection_permissions` for
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
- [x] 🔬🤖 P3 — Locale proofing queue for identical-to-English feature copy
  - Why: the feature-definition i18n extraction is shipped, but the generated
    coverage report now shows only 23.5%-27.7% translated coverage across
    non-EN locales after feature keys were added. Chrome and MDN extension i18n
    guidance both treat
    `messages.json` as the user-visible string source of truth, so seeded
    English placeholders should be tracked separately from intentional brand or
    technical terms.
  - Evidence: refreshed `docs/i18n-coverage.md` profiles 860 EN keys and now
    separates exact reviewed brand/technical matches from unresolved
    placeholders. The feature-copy queue shows 582 of 612
    `feature_*_(name|desc)` keys still unresolved per non-EN locale after the
    exact reviewed matches are excluded. Chrome i18n docs require user-visible
    strings in locale `messages.json`
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
  - Status 2026-06-06: shipped in Cycle 43. `npm run i18n:coverage` writes the
    classified coverage report and feature-copy queue; `npm run
    i18n:coverage:warn` warns above the 582-message unresolved feature-copy
    baseline; `scripts/generate-locales.js` now shares the reviewed exact
    do-not-translate policy and preserves proofed feature overrides when
    regenerating locale bundles. Remaining translation work is native-speaker
    proofing, not queue infrastructure.
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
- [x] P1 — Cross-browser parity gate: Firefox MV3 smoke before each AMO submission
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
    Pre-delivery gap: `tests/hardening.test.js` only asserted the patcher
    transforms the manifest, `.github/workflows/build.yml` ran `npm test`,
    `npm run check`, and `npm run build:userscript`, and
    `docs/firefox-executescript-preflight.md` recorded no local Firefox runtime
    for a browser-console run. [Verified]
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
  - Status 2026-06-05: delivered. `web-ext@10.3.0` is exact-pinned and
    `npm run check` now runs `npm run check:firefox`, which stages both
    store-safe and GitHub-full Firefox manifests and runs
    `web-ext lint --source-dir` with zero errors, warnings, or notices. The tag
    release workflow installs Firefox with pinned
    `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`
    (`v1.7.2`) after artifact generation, then runs `npm run smoke:firefox`
    against the store-safe staged manifest in a clean headless Firefox profile
    on `https://www.youtube.com/watch?v=jNQXAC9IVRw`. The smoke reports profile,
    MV3 manifest version, Gecko ID, Firefox path, start URL, and captured
    `web-ext run` startup/install output. The first gate run exposed and fixed
    AMO blockers: non-square PNG icon dimensions, the Firefox data-consent floor
    now set to `142.0`, and raw `innerHTML` sinks in TrustedHTML paths.
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
- [x] P2 — WCAG 2.2 AA audit pass for in-page overlays (beyond the popup)
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
  - Touches: `scripts/`, `tests/`, `docs/`, `package.json`,
    `extension/core/toast-dom.js`, and generated overlay render paths in
    `extension/ytkit.js` / `features/*`.
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
  - Status 2026-06-05: shipped. Added `scripts/audit-overlays-a11y.js`, wired
    `npm run audit:overlays` into `npm run check`, and added hardening coverage
    that runs the audit's mutation canaries. Runtime-generated overlay controls
    now carry the missing region/dialog names, live status labels, accessible
    action names, focus-visible CSS, and explicit WCAG 2.2 24px target-size
    floors needed by the static gate. The manual screen-reader smoke checklist
    now documents the automated coverage boundary for announcement quality.
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

## Continuation State

### Last Completed Cycle

Cycle 44 - Locale proofing export, 2026-06-06.

### Current Focus

Continue autonomous roadmap expansion from the latest open high-value items in
this repository, committing and pushing completed work when the branch remote
allows it.

### Important Findings So Far

- Cycle 32 found that the remaining capture-week surfaces require
  authenticated or menu-state browser evidence. The public CDP helper now covers
  public surfaces, but History, Watch Later, and notifications need a safe
  profile/auth-state path outside the repo plus an opened-notification-menu
  capture flow.
- Cycle 35 narrowed that work into an implementation contract: prefer an
  absolute external Chrome `--user-data-dir` / `ASTRA_CAPTURE_PROFILE_DIR` for
  the current CDP helper; reject any auth/profile path under the repo; fail
  before writing MHTML when auth is missing, Watch Later is empty, or the
  notifications menu cannot expose `ytd-notification-renderer`; add builder and
  regression registrations only atomically with derived fixtures that prove
  stable matches.
- Cycle 36 delivered the helper-only safety slice: authenticated profiles now
  exist for `history`, `watch-later`, and `notifications`; repo-local profile
  paths are rejected before Chrome launch; missing auth / empty content fails
  before MHTML write; notifications opens the topbar menu before capture; and
  tests cover the deterministic negative paths without requiring a signed-in
  profile.
- Cycle 37 extended the Chromium optional-host smoke from readiness-only into
  explicit headed prompt-state modes. The default smoke still verifies
  pre-grant readiness headlessly with Edge fallback, while `--headed
  --expect-deny` validates denial and `--headed --attempt-grant
  --revoke-after-grant` validates accepted-then-revoked grants through
  `chrome.permissions.remove()`.
- Cycle 38 added a headed Firefox optional-host prompt harness. The local
  machine does not have Firefox installed, so the cycle verified the script and
  argument shape but did not claim a native Firefox prompt pass.
- Cycle 39 added `npm run policy:actions`, a deterministic workflow inventory
  and selected-actions payload generator. It proves the current source-side
  allowlist has only the pinned `browser-actions/setup-firefox` ref outside
  GitHub-owned actions.
- Cycle 40 guarded the PR-only `Dependency review` job behind repository
  variable `DEPENDENCY_REVIEW_REQUIRED`, so dependency PRs stay advisory until
  hosted dependency graph setup is proven and the maintainer opts into
  enforcement.
- Cycle 41 added `npm run release:readiness`, a generated JSON/Markdown release
  report that checks version surfaces, release-manifest/SHA256SUMS/SBOM proof,
  expected artifact inventory, root signing-key absence, local signing policy,
  and companion EXE/sidecar truth. The release workflow now requires the report
  to pass before artifact upload.
- Cycle 42 added `npm run release:verify-digests`, a read-only release upload
  verifier that compares GitHub Release asset `sha256:` digests against local
  `build/SHA256SUMS`, including the checksum file itself. It supports live
  `gh release view` output and offline fixture JSON for tests; the real public
  pass must run from the maintainer-local signed artifact directory.
- Cycle 43 added the locale proofing queue: `npm run i18n:coverage` now
  classifies exact reviewed brand/technical matches separately from unresolved
  placeholders, emits per-locale feature name/description proofing counts plus
  sample keys, and `npm run i18n:coverage:warn` warns above the 582-message
  unresolved feature-copy baseline. The locale generator now preserves proofed
  feature overrides while sharing the reviewed do-not-translate policy.
- Cycle 44 added `npm run i18n:proofing-export`, which writes translator-ready
  per-locale CSV files plus `index.json` under ignored `build/i18n-proofing/`.
  Each unresolved feature name/description placeholder gets a row with blank
  `proposed_translation` and `notes` fields for native-speaker review.
- Cycle 33 found that hosted/manual security work needs one closure runbook
  before settings mutation. Cycle 34 delivered that runbook and refreshed
  hosted read-only evidence successfully.
- Current hosted state remains manual-gated: Actions `allowed_actions` is `all`,
  `sha_pinning_required` is `false`, Dependabot security updates are disabled,
  `main` does not require code-owner reviews, default-branch CODEOWNERS errors
  still return `404`, and release `v4.46.0` still lacks companion EXE/sidecar
  assets. The selected-actions payload can now be regenerated with
  `npm run policy:actions` before any hosted settings change. Dependency
  review enforcement can now be toggled with `DEPENDENCY_REVIEW_REQUIRED=true`
  after dependency graph proof. Release artifact proof can now be regenerated
  with `npm run release:readiness -- --require-pass` after the local release
  build, SBOM, and manifest steps. After upload, `npm run
  release:verify-digests -- --tag vX.Y.Z` now performs the digest comparison
  from the same maintainer-local artifact directory.

### Next Best Actions

1. Run positive authenticated/menu-state captures only when a maintainer-local
   external Chrome profile is available and populated for History, Watch Later,
   and notifications; then add fixture-builder registrations, derived token
   fixtures, selector-regression required matches, and selector-pack provenance
   in one atomic follow-up.
2. If the branch has landed on `main` and the maintainer explicitly wants hosted
   settings changed, follow `docs/hosted-policy-closure.md`; otherwise keep the
   hosted mutations open.
3. After dependency graph is enabled, rerun a dependency PR and set
   `DEPENDENCY_REVIEW_REQUIRED=true` only if the check no longer fails with
   repository setup text.
4. Run the headed Chromium optional-host accept/deny/revoke modes and the new
   Firefox `--headed --manual-optional-hosts` harness on a release machine with
   the target browsers installed.
5. After a maintainer-local release build, run `npm run release:readiness --
   --require-pass`, then upload assets and compare GitHub Release digests
   against `build/SHA256SUMS` with `npm run release:verify-digests --
   --tag vX.Y.Z`.
6. Use `npm run i18n:proofing-export` to regenerate the native-speaker
   proofing pack when locale work resumes; the queue/export infrastructure
   itself is shipped.

### Unprocessed Leads

- Which maintainer-local account/profile can provide populated History, Watch
  Later, and at least one notification without leaking account content into raw
  tracked files.
- Whether a later Playwright migration is still worth the added dependency now
  that the lower-risk external Chrome profile lane exists.
- Whether dependency graph / Dependabot alerts should be enabled alone first or
  together with Dependabot security updates in the hosted settings pass.

### Files Still To Inspect

- None for the current hosted-policy source-hardening thread.

### Searches Completed In Cycle 37

- `site:developer.chrome.com extensions permissions.request user gesture optional_host_permissions`
- `site:developer.mozilla.org WebExtensions optional_host_permissions permissions.request Firefox`
