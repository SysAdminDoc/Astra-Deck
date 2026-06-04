# Astra Deck Research Report

Deep-research and product-map pass conducted 2026-06-03. This is the canonical
research summary; actionable items live in [ROADMAP.md](ROADMAP.md) under
"Research-Driven Additions." Pre-consolidation source documents are archived at:

- `docs/archive/research/RESEARCH_FEATURE_PLAN.md`
- `docs/archive/research/RESEARCH_FEATURE_PLAN_PASS3.md`
- `docs/archive/roadmap-dossier-2026-05-21.md` (the legacy internal
  planning-track dossier labelled v5.0.0 -> v6.0.0: product plan, competitive
  matrix, feature catalog, and technical reconnaissance; not the shipped
  product-version line, which currently agrees at v4.46.0)

Claim labels: [Verified] = read in-tree or confirmed against a cited source;
[Likely] = strong inference from in-tree evidence; [Assumption] = reasonable
default not directly confirmed; [Needs validation] = requires a device, browser,
or maintainer action to confirm.

## 2026-06-04 Freshness Refresh

- [Verified] Cycle 17 signing-key custody pass on 2026-06-04 found that
  `ytkit.pem` is not tracked by git and has no history for that path, but this
  local checkout contains an ignored private-key-shaped file in the repo root.
  Current key-management docs say the key lives outside the repo, while
  `build-extension.js` hardcodes `path.join(__dirname, 'ytkit.pem')` and
  auto-moves generated key material back into that root path. ROADMAP now
  carries a P0 item to move the CRX signing key to an explicit external path,
  fail closed when the key path is missing, and verify the self-distributed
  extension ID without printing key material. Detailed evidence lives in
  `docs/research-cycle-17-signing-key-custody.md`.
- [Verified] Cycle 16 GitHub Actions supply-chain policy pass on 2026-06-04
  found that repository Actions permissions are enabled but broad
  (`allowed_actions: all`) and do not require full-length SHA pins
  (`sha_pinning_required: false`). Workflows currently use tag-pinned
  GitHub-owned actions across `validate.yml`, `build.yml`, and
  `yt-dlp-smoke.yml`; default `GITHUB_TOKEN` permissions are already read-only.
  ROADMAP now carries a P2 item to complete the Node 24 action-major migration,
  pin external action refs to full SHAs with Dependabot-friendly version
  comments, then switch repository Actions permissions to selected sources with
  SHA pinning required. Detailed evidence lives in
  `docs/research-cycle-16-actions-sha-pinning.md`.
- [Verified] Cycle 15 secret-scanning pass on 2026-06-04 found one open GitHub
  secret-scanning alert in the public repository: alert 1, type
  `google_api_key`, created 2026-01-26, unresolved, `publicly_leaked: true`,
  `multi_repo: true`, and `validity: unknown`. Locations include current and
  historical generated userscript/extension files, but the secret value was not
  printed or committed during research. ROADMAP now carries a P0 item to triage
  whether this is a real credential or an intentional public YouTube/Innertube
  bootstrap key, resolve the alert with an explicit rationale, and enable
  additional secret-scanning settings where available. Detailed evidence lives
  in `docs/research-cycle-15-secret-scanning-alert.md`.
- [Verified] Cycle 14 release-doc contract reconciliation pass on 2026-06-04
  found that the release process is now split between CI-built/attested
  workflow artifacts and maintainer-local public release assets, but current
  docs still carry stale claims that CI creates GitHub Releases directly or that
  release checksum/provenance, Python audit, and privacy artifacts are absent.
  This report now updates those current sections, and ROADMAP carries a P2 item
  to reconcile non-planning docs such as `docs/architecture.md` with
  `docs/signing-keys.md`. Detailed evidence lives in
  `docs/research-cycle-14-release-doc-contract-reconciliation.md`.
- [Verified] Cycle 13 Actions Node 24 readiness pass on 2026-06-04 found that
  the latest green `Validate` run on `main` and latest `Build & Release` tag run
  both emit GitHub's Node 20 JavaScript action deprecation warning. Current
  workflow pins include `actions/checkout@v4`, `actions/setup-node@v4`,
  `actions/setup-python@v5`, and `actions/upload-artifact@v4`; GitHub says
  runners start defaulting JavaScript actions to Node 24 on 2026-06-16 and
  later remove Node 20. ROADMAP now carries a P1 item to migrate workflows to
  Node 24-ready action majors and prove `Validate`, `Build & Release`, and
  `yt-dlp Smoke` no longer emit the warning. Detailed evidence lives in
  `docs/research-cycle-13-actions-node24-readiness.md`.
- [Verified] Cycle 12 dependency-review enablement pass on 2026-06-04 found
  that open Dependabot PR #11 is blocked by platform setup rather than a
  vulnerable dependency: `Validate / Dependency review` fails with GitHub's
  message that dependency graph must be enabled, while the same run's JS,
  Python audit, and Python downloader jobs are green. The repository
  security-analysis API response shows Dependabot security updates disabled and
  no dependency-graph field in the returned block. ROADMAP now carries a P1
  manual-gated item to enable dependency graph / Dependabot alert settings,
  rerun PR #11, and only require PR-only Dependency review after a successful PR
  context is proven. Detailed evidence lives in
  `docs/research-cycle-12-dependency-review-enablement.md`.
- [Verified] Cycle 11 main-protection pass on 2026-06-04 found that GitHub
  branch protection exists for `main`, but required status checks are not
  enabled and repository rulesets are empty. Recent `Validate` runs are green
  after the CI/dependency fixes, but earlier failed `main` pushes still landed,
  so the build lane added required `Validate` checks to `main` branch protection
  and recorded the exact check names in `docs/repo-settings.md`. Detailed
  evidence lives in `docs/research-cycle-11-main-protection-status-checks.md`.
- [Verified] Cycle 10 Python dependency-audit pass on 2026-06-04 found a
  preventive hardening gap rather than an active advisory: Dependabot covers pip
  and the current `pip-audit 2.10.0` probe against
  `astra_downloader/requirements.txt` found no known vulnerabilities across 25
  resolved packages. The build lane closed the gap by adding a dedicated
  `Validate` Python dependency-audit job with JSON artifact upload plus PR
  dependency-review coverage. Detailed evidence lives in
  `docs/research-cycle-10-python-dependency-audit.md`.
- [Verified] Cycle 9 privacy/consent-readiness pass on 2026-06-04 found a
  non-duplicate release-readiness gap: Astra Deck has strong store permission
  rationale and profile-split artifacts, but no concrete privacy-policy source
  or Firefox data-transmission consent strategy pinned to the generated Firefox
  manifest path. ROADMAP now carries a P1 item for a cross-store privacy
  disclosure and Firefox data-consent packet, with detailed evidence in
  `docs/research-cycle-9-privacy-consent-readiness.md`.
- [Verified] Cycle 8 CI/release-integrity pass on 2026-06-04 found two
  non-duplicate delivery risks: `Validate` was red on `main` because the Python
  downloader job failed test collection on Ubuntu with missing `libEGL.so.1`,
  and the public latest GitHub release still served v4.5.2 while the source
  tree/build outputs were v4.46.0. The build lane closed both gaps: `Validate`
  is green and public latest release is now `v4.46.0` with 12 assets,
  `SHA256SUMS`, release manifest, SBOM, and a documented local-signing path.
  Detailed evidence lives in `docs/research-cycle-8-ci-release-integrity.md`.
- [Verified] Cycle 2 refresh on 2026-06-04 fetched and compared `origin/main`
  (`git rev-list --left-right --count HEAD...@{u}` returned `0 0`) after the
  selector-capture implementation landed separately on the build lane. The
  roadmap now treats Return YouTube Dislike estimate disclosure, first-run
  companion onboarding, and diagnostics export as shipped work, with a new
  non-duplicate P3 follow-up for proofing identical-to-English locale copy.
- [Verified, external] Primary-source refresh for this cycle checked Chrome
  extension i18n guidance, MDN WebExtensions i18n guidance, Mozilla
  Extension Workshop MV3 / `web-ext` / signing documentation, W3C WCAG 2.2
  Target Size and Focus Appearance guidance, Chrome Web Store MV3 policy, and
  the yt-dlp GitHub releases/PO-token guidance. The current `yt-dlp==2026.3.17`
  pin remains aligned with the latest stable GitHub release observed on this
  pass; PO-token churn remains a companion watch item, but the existing Deno /
  PO-token health and yt-dlp smoke rows already cover it.
- [Verified] Cycle 3 reconciliation on 2026-06-04 updated stale report sections
  that still described settings import/export, onboarding, diagnostics export,
  RYD estimate disclosure, settings migration, and the yt-dlp cookie threat model
  as gaps after those items had shipped.
- [Verified] Cycle 4 capture-matrix pass on 2026-06-04 found that
  `scripts/build-selector-fixtures.js` still registers only home, watch, and
  live-chat MHTML sources, with DOM-subset matching limited to `playerChrome`
  and `liveChat`. ROADMAP P2 now lists the exact missing capture files, mapped
  selector packs, builder/test hooks, and verification path for the capture-week
  expansion.
- [Verified] Cycle 5 Firefox-gate pass on 2026-06-04 confirmed the repo already
  has static Firefox manifest-patch coverage, but release artifacts are not run
  through `web-ext lint` or a clean Firefox profile. ROADMAP P1 now calls for a
  pinned Firefox artifact lint/load gate with captured startup errors.
- [Verified] Cycle 6 overlay-a11y pass on 2026-06-04 found that the automated
  audit scripts cover popup HTML/CSS only, while toast DOM, download dialogs,
  transcript panels, video notes, subscription group surfaces, and downloader
  health/history panels remain manual via `docs/screen-reader-smoke.md`. ROADMAP
  P2 now names these targets and the first-pass target-size/focus/name/live-region
  assertions.
- [Verified] Cycle 7 locale-proofing pass on 2026-06-04 regenerated
  `docs/i18n-coverage.md` after feature-definition i18n extraction. The current
  report profiles 860 EN keys and shows 622-658 identical-to-English strings per
  non-EN locale; 584 of 612 feature name/description keys are still identical to
  EN across non-EN locale bundles.
- [Verified] The live working tree has advanced beyond the 2026-06-03 report:
  NF6 companion self-update, NF2 nested subscription groups, dead-channel
  detection / unsubscribe staging, NF1 per-video notes, the group notifications
  digest, Study / Work export, feature-definition i18n, and store-safe /
  GitHub-full release artifact split, monthly yt-dlp smoke CI, and the
  selector-fixture match harness, and the Firefox programmatic-injection
  pre-flight are now
  represented in `ROADMAP.md`, `extension/ytkit.js`, docs, the packager,
  workflows, fixture generation, static checks, and hardening tests. The
  subscription implementation uses rendered-feed DOM heuristics, local
  last-visit data, and a 30-day local undo/staging window rather than a YouTube
  Data API unsubscribe path; the notes and study/work exports stay local-first
  with versioned JSON, Markdown, or CSV downloads; the settings-panel feature
  labels now resolve through the locale layer before falling back to inline
  English; the store-safe package now strips AI, Cobalt, and loopback host
  grants while GitHub-full keeps the complete data-flow catalogue; yt-dlp
  bumps now run through exact Python package pins plus a bounded real-download
  smoke workflow; selector fixture regeneration now proves `playerChrome` and
  `liveChat` selector-pack chains against decoded MHTML markup; Firefox
  pre-flight now blocks future programmatic injection APIs until their
  `moz-extension://` targets are reviewed; and the Flask `/download` boundary
  now rejects client-supplied yt-dlp argv/flag fields before queueing; storage
  growth for notes, timestamp bookmarks, watch progress, and watch-time stats
  is bounded at write time; and `policy-profile.js` scrub coverage now removes
  separator-aware API-key names plus password/credential/key-alias/cookie/
  token/bearer/secret/auth-shaped values before profile or forward-compat
  export passthrough; and Cobalt fallback failures now record an actionable
  `cobalt-fallback` diagnostic with origin-only endpoint context when Astra
  Downloader is offline; and a new long-session route/mutation stress test now
  pins shared observer count, scoped-rule early exits, capped diagnostic maps,
  and listener/observer cleanup; and a pinned v1 full-profile settings fixture
  now proves the 362-key settings schema migrates forward without unclassified
  drops.
- [Verified] Validation on 2026-06-04 after the profile-split artifact batch:
  `node --check build-extension.js`, `node --check extension/background.js`,
  `node --check tests/hardening.test.js`, `node --test tests/hardening.test.js`
  (421 checks), `npm run check`, `npm test` (616 checks), `npm run build`,
  ZIP manifest inspection for store-safe/full host grants, and
  `node sync-userscript.js` all passed. The build emitted store-safe and
  GitHub-full Chrome ZIP/CRX plus Firefox ZIP/XPI artifacts for v4.46.0.
- [Verified] Validation on 2026-06-04 after the monthly yt-dlp smoke batch:
  `node --check tests/yt-dlp-smoke-workflow.test.js`,
  `py -3.12 -m py_compile scripts/yt-dlp-smoke.py`,
  `node --test tests/yt-dlp-smoke-workflow.test.js` (3 checks),
  `py -3.12 -m pip install -r astra_downloader/requirements.txt`,
  `py -3.12 scripts/yt-dlp-smoke.py` (downloaded `dQw4w9WgXcQ.mp4`, 3441508
  bytes), `py -3.12 -m pytest astra_downloader` (117 tests), `npm run check`,
  `npm test` (619 checks), and `npm run build` all passed.
- [Verified] Validation on 2026-06-04 after the selector-resilience harness
  batch: `node --check scripts/build-selector-fixtures.js`,
  `npm run build:fixtures`, `node --check tests/selector-regression.test.js`,
  `node --test tests/selector-regression.test.js` (33 checks), `npm run check`,
  `npm test` (621 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the Firefox injection audit batch:
  `node --check scripts/check-firefox-injection.js`,
  `node scripts/check-firefox-injection.js`, `node --check
  tests/firefox-injection-audit.test.js`, and `node --test
  tests/firefox-injection-audit.test.js` (3 checks), `npm run check`,
  `npm test` (624 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the downloader request-field
  allowlist batch: `py -3.12 -m py_compile astra_downloader/astra_downloader.py`,
  `py -3.12 -m pytest astra_downloader/test_astra_downloader.py -q` (121
  tests), `npm run check`, `npm test` (624 checks),
  `py -3.12 -m pytest astra_downloader` (121 tests), `npm run build`,
  `node sync-userscript.js`, and `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the storage-growth cap batch:
  `node --check extension/ytkit.js`, `node --check YTKit.user.js`,
  `node --test tests/hardening.test.js tests/userscript-parity.test.js` (429
  checks), `npm run check`, `npm test` (628 checks), `npm run build`,
  `node sync-userscript.js`, and `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the policy-profile scrub coverage
  batch: `node --check extension/core/policy-profile.js`,
  `node --check tests/hardening.test.js`, and
  `node --test tests/hardening.test.js` (426 checks), `npm run check`,
  `npm test` (630 checks), `npm run build`, `node sync-userscript.js`,
  `node --check YTKit.user.js`, and `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the Cobalt fallback diagnostic
  batch: `node --check extension/ytkit.js`,
  `node --check tests/hardening.test.js`, and
  `node --test tests/hardening.test.js` (427 checks), `npm run check`,
  `npm test` (631 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the long-session memory-leak
  regression batch: `node --check tests/long-session.test.js` and
  `node --test tests/long-session.test.js` (1 check), `npm run check`,
  `npm test` (632 checks), `npm run build`, `node sync-userscript.js`, and
  `git diff --check` all passed.
- [Verified] Validation on 2026-06-04 after the settings migration fixture
  batch: `node --check tests/settings-migration-roundtrip.test.js` and
  `node --test tests/settings-migration-roundtrip.test.js` (2 checks),
  `npm run check`, `npm test` (633 checks), `npm run build`,
  `node sync-userscript.js`, and `git diff --check` all passed.
- [Verified, external] Current source check did not create a new roadmap row:
  Chrome Web Store policy still keeps the single-purpose / no-remotely-hosted-
  code / permission-rationale items relevant; MDN's `scripting.executeScript`
  page is still the right Firefox MV3 compatibility anchor; Mozilla's Firefox
  128 MV3 MAIN-world support keeps the Firefox pre-flight item actionable; yt-dlp
  `2026.03.17` remains the latest stable release observed, with YouTube support
  explicitly called out as a churn risk; and YouTube Data API subscription reads
  require OAuth and have documented quota cost, supporting the local-first DOM
  staging approach for this slice.
- [Verified, external] Package/security freshness check: `npm audit --omit=dev
  --audit-level=moderate` is clean, `crx3` is current at 2.0.0, and ESLint has
  low-risk patch/minor drift (`10.2.1` installed; npm reports `10.4.1` current).
  The dirty companion source/test work in the live tree already targets the
  existing yt-dlp flag-allowlist roadmap row, so this pass updated that row's
  status instead of adding a duplicate.

## Executive Summary

Astra Deck is a mature, single-developer YouTube enhancement platform spanning a
Manifest V3 extension (Chrome/Edge/Brave/Firefox 140+), a Tampermonkey/Violent-
monkey userscript built from the same source, and a local Python/Flask + PyQt6 +
yt-dlp companion downloader. [Verified] It carries a 362-key flat settings schema,
27 `extension/core/` runtime modules, 11 peeled `extension/features/` modules, a
28-surface capture-provenanced selector-pack system, 10 bundled UI locales, and a
strong CI gate (syntax, versions, i18n, settings, no-eval, lint, a11y, contrast,
JavaScript dependency audit, Python dependency audit, dependency review, plus a
build/release workflow). [Verified]

The engineering arc is sound; the dominant risks are (1) **runtime DOM churn**
against YouTube's high-velocity redesigns, (2) **Firefox release parity** before
AMO or self-distributed Firefox updates, and (3) **repository/settings drift**
where CI jobs exist before the GitHub security-analysis settings or action
runtime migrations that make them durable.

Top remaining opportunities (one-liners):

1. Triage and resolve the open Google API Key secret-scanning alert without
   exposing the secret value. [Verified]
2. Move CRX signing key custody out of the repo worktree and require an
   explicit external key path for maintainer-local CRX release builds.
   [Verified]
3. Migrate GitHub Actions workflows to Node 24-ready action majors before
   GitHub-hosted runners default JavaScript actions to Node 24 on 2026-06-16.
   [Verified]
4. Pin GitHub Actions workflow refs to full-length SHAs and enable selected
   action sources / SHA-pinning policy after the Node 24 action-major migration.
   [Verified]
5. Enable dependency graph / Dependabot alert settings so the PR-only
   Dependency review job can evaluate dependency changes instead of failing on
   repository setup. [Verified]
6. Reconcile release automation docs with the current maintainer-local artifact
   contract so architecture/release docs do not imply CI publishes public CRX
   releases. [Verified]
7. Firefox MV3 parity smoke gate before AMO or self-distributed Firefox updates:
   lint both Firefox profiles with `web-ext` and load at least store-safe in a
   clean Firefox profile. [Verified]
8. MHTML capture-week expansion across Shorts, channel, search, history,
   watch-later, embedded player, and notifications surfaces, including fixture
   builder and selector-match coverage for each registered pack. [Verified]
9. WCAG 2.2 AA audit for in-page overlays, starting with toast DOM, download
   dialogs, transcript panels, video notes, subscription group surfaces, and
   downloader health/history panels. [Verified]
10. Locale proofing queue for identical-to-English feature names/descriptions in
   non-EN bundles; current coverage is 23.5%-27.7% translated after the generated
   feature keys landed. [Verified]
11. Signed Astra Downloader installer/MSI once the signing budget and submission
   intent are decided. [Needs validation]

## Evidence Reviewed

- `package.json` (v4.46.0, node ≥22, crx3 dep, full `check`/`test` scripts). [Verified]
- `astra_downloader/requirements.txt` exact-pins `yt-dlp==2026.3.17` and
  `curl_cffi==0.15.0` for the scheduled extractor smoke gate, while retaining
  upper-major GUI/server dependency bounds. [Verified]
- `extension/manifest.json` (MV3 v4.46.0, 4 permissions, 19 full-profile host
  origins, document_start MAIN + ISOLATED dual-world content scripts, live-chat
  excluded from the main scripts). [Verified]
- `extension/core/` (27 modules: registry, selectors, navigation, api-limiter,
  trusted-html, predicate-sandbox, transcript-service, storage-manager,
  diagnostic-log, policy-profile, selector-health, settings-schema 107 KB, etc.). [Verified]
- `extension/features/` (11 peeled modules) and `extension/ytkit.js` (2.1 MB
  monolith) + `ytkit-main.js` MAIN-world bridge. [Verified]
- `extension/default-settings.json` (362 keys). [Verified]
- `astra_downloader/` (Flask + PyQt6 + yt-dlp companion; loopback 9751 + 5
  fallbacks; bearer-token + Host-header allowlist per `docs/architecture.md`). [Verified]
- `scripts/` (build, fixtures, i18n, storage audit, a11y/contrast audits,
  version/settings/no-eval checks, manifest-patch for Gecko). [Verified]
- `.github/workflows/build.yml`, `validate.yml`, and `yt-dlp-smoke.yml` (test +
  check gate, tag-driven release with version-surface verification, and monthly
  `workflow_dispatch` yt-dlp extractor smoke). [Verified]
- GitHub Actions Validate runs `26950005859`, `26950502914`, `26950889307`,
  and `26951303023` are green on `main` after the Python Qt-runtime fix,
  privacy/consent packet, Python dependency audit gate, and release-tooling
  update. [Verified]
- Latest GitHub release `v4.46.0` now points at `ac6a363` and attaches 12
  assets: eight profile-split artifacts, userscript, SBOM, `release-manifest.json`,
  and `SHA256SUMS`. [Verified]
- `tests/` (19 spec files incl. hardening, selector-regression,
  settings-migration-roundtrip, userscript-parity). [Verified]
- `docs/architecture.md`, `docs/cws-submission-checklist.md`,
  `docs/screen-reader-smoke.md`, `docs/signing-keys.md`,
  `docs/store-permission-rationale.md`, and
  `docs/research-cycle-9-privacy-consent-readiness.md`,
  `docs/research-cycle-10-python-dependency-audit.md`,
  `docs/research-cycle-11-main-protection-status-checks.md`, and
  `docs/research-cycle-12-dependency-review-enablement.md`, and
  `docs/research-cycle-13-actions-node24-readiness.md`, and
  `docs/research-cycle-14-release-doc-contract-reconciliation.md`, and
  `docs/research-cycle-15-secret-scanning-alert.md`, and
  `docs/research-cycle-16-actions-sha-pinning.md`, and
  `docs/research-cycle-17-signing-key-custody.md`. [Verified]
- CRX signing-key custody probe: `ytkit.pem` is ignored by `.gitignore` and is
  not tracked in current git state, but the local checkout has a 1732-byte
  private-key-shaped root file. `docs/signing-keys.md` says the key lives
  outside the repo, while `build-extension.js` hardcodes the repo-root
  `ytkit.pem` path and moves generated key material there if no key exists.
  The key body was not printed. [Verified]
- GitHub Actions policy probe: repository Actions permissions are currently
  `allowed_actions: all` and `sha_pinning_required: false`; workflow defaults
  keep `GITHUB_TOKEN` read-only and prevent workflow-created PR approvals. The
  current workflows contain tag-pinned GitHub-owned action refs across
  `Validate`, `Build & Release`, and `yt-dlp Smoke`. GitHub's secure-use docs
  say full-length commit SHAs are the immutable action-reference option, and
  repository settings / REST APIs can require SHA pins and selected action
  sources. [Verified]
- Secret scanning alert probe: GitHub reports one open `google_api_key` alert
  with `publicly_leaked: true`, `multi_repo: true`, and `validity: unknown`;
  locations include current/historical generated userscript and extension files.
  Secret scanning and push protection are enabled, while non-provider pattern
  scanning and validity checks are disabled in the current repository
  security-analysis response. [Verified]
- Open Dependabot PR #11 and run `26950993002`: Dependency review fails with
  GitHub's dependency-graph enablement message while the other `Validate` jobs
  pass. The repository security-analysis API response shows a public repository
  with Dependabot security updates disabled and no dependency-graph field in the
  returned block. [Verified]
- Current workflow action-runtime probe: `gh run view 26953094214 --log` and
  `gh run view 26951406026 --log` both emit GitHub's Node 20 JavaScript action
  deprecation warning. `.github/workflows/validate.yml`, `build.yml`, and
  `yt-dlp-smoke.yml` still pin Node 20-era `checkout`, `setup-node`,
  `setup-python`, and `upload-artifact` action majors. [Verified]
- Release contract reconciliation probe: `.github/workflows/build.yml` uploads
  `build/*` as a workflow artifact and creates CI build/SBOM attestations on tag
  refs, while `docs/signing-keys.md` says public GitHub Releases remain a
  maintainer-local upload path because `ytkit.pem` never enters CI.
  `docs/architecture.md` still says the CI row ends in `gh release create`.
  [Verified]
- `git log -30` (active feature-peel cadence; parallel development in flight). [Verified]
- Competitive / standards landscape: SponsorBlock, DeArrow, Return YouTube
  Dislike, Enhancer for YouTube, Improve YouTube, PocketTube, BlockTube, Unhook;
  Chrome Web Store MV3 program policy; AMO Firefox MV3; WCAG 2.2 AA; yt-dlp
  cookie-handling advisories; Qt Linux runtime requirements; GitHub release asset
  digests and artifact/SBOM attestations; npm SBOM; Chrome Web Store privacy
  fields / Limited Use policy; Mozilla add-on data-transmission consent and
  Firefox built-in `data_collection_permissions`; PyPA `pip-audit`,
  `pypa/gh-action-pip-audit`, and GitHub dependency review. [Verified, external]

## Current Product Map

Four moving parts communicating across three trust boundaries (per
`docs/architecture.md`): [Verified]

1. **MV3 extension** (`extension/`) — content scripts inject at `document_start`
   in both MAIN (`ytkit-main.js`) and ISOLATED (`core/*` + selector packs +
   `ytkit.js`) worlds; a dedicated all-frame injection handles the live-chat
   iframe; `background.js` is the service worker.
2. **Userscript** (`YTKit.user.js`) — built from `extension/ytkit.js` via
   `sync-userscript.js`; parity guarded by `userscript-parity.test.js`.
3. **Astra Downloader** — Python companion, HTTP on `127.0.0.1:9751` (+ five
   fallback ports), bearer-token auth + DNS-rebinding Host-header defense.
4. **Toolbar popup** — the only settings surface (the options page was retired in
   v3.19.0).

Target surface: YouTube desktop web + `youtube-nocookie.com` + `youtu.be` +
live-chat iframe + `i.ytimg.com`; `m.youtube.com` and `studio.youtube.com`
excluded by design. [Verified]

## Feature Inventory

| Area | Where | Maturity | Coverage |
|------|-------|----------|----------|
| Sponsor/segment skip (SponsorBlock) | `extension/ytkit.js`, `sponsor.ajay.app` host | Shipped | Hardened, rate-limited [Likely] |
| Title/thumbnail (DeArrow-class) | settings schema + `ytkit.js` | Shipped | [Likely] |
| Return YouTube Dislike | `returnyoutubedislikeapi.com` host | Shipped | Estimate disclosure now appears in count/ratio UI, locale copy, title, and aria-label paths [Verified] |
| Feed/comment/channel filtering (BlockTube-class) | `features/video-hider/`, `ytkit.js` | Shipped | ReDoS-guarded; channel-key cache [Verified] |
| Subscription groups (PocketTube-class) | subscription-groups feature | Shipped | Depth-2 groups, dead-channel staging, and group digest are shipped; external sync remains absent [Verified] |
| Theater split / sticky player | `features/sticky-video/`, `player-dock/` | Shipped | Lifecycle-unified chat observer [Verified] |
| Theming / OLED tokens | `features/theme-css/`, `wave-8-css/`, `home-subs-css/` | Shipped | Schema-driven [Verified] |
| Transcript viewer + IndexedDB search | `core/transcript-service.js` | Shipped | [Verified] |
| Study / Work export | `researchSpacedReview` feature | Shipped | Markdown/CSV export from watch time, focused mode, digital wellbeing, and timestamp bookmarks [Verified] |
| AI summary (BYO key / local) | OpenAI/Anthropic/Gemini + Ollama hosts | Shipped, opt-in | GitHub-full artifact only [Verified] |
| Downloader companion | `astra_downloader/` | Shipped | Self-update endpoint and popup action; local loopback grants stay GitHub-full [Verified] |
| Per-video notes | `videoNotes` feature | Shipped | Local-first notes, versioned export, 1000-note LRU cap [Verified] |
| Settings import/export | popup + `policy-profile.js` | Shipped | Schema-validated local backup/import with credential scrub and schema-only export [Verified] |
| Selector-pack health | `core/selector-health.js` | Shipped | Now reports attribute-shape drift [Verified] |

## Competitive Landscape

- **SponsorBlock / DeArrow** (same author): community-sourced segment skip and
  title/thumbnail correction; 4.7★; the de-facto baseline Astra already mirrors. [Verified]
- **Enhancer for YouTube**: deep player control (quality/codec/FPS, popup player)
  but documented Firefox reliability gaps and YouTube-update compatibility churn —
  the clearest opening for Astra cross-browser parity. [Verified]
- **Improve YouTube!**: open-source, frequent updates, strong Firefox support —
  Astra's nearest open-source rival on reliability. [Verified]
- **PocketTube** (200k+ users): nested subscription groups, custom icons,
  "play all," and cross-device sync via Google Drive / Chrome profile — Astra's
  subscription roadmap is differentiated by local-first but lacks sync/import-export. [Verified]
- **BlockTube**: rule-based filtering; Astra's filter engine is the planned
  superset (predicate-sandbox already exists for safe DSL evaluation). [Verified]
- **Return YouTube Dislike**: estimate-based for post-2021/low-traffic videos —
  Astra now discloses that caveat in the rendered count/ratio UI and locale
  descriptions. [Verified]

Standards: Chrome Web Store MV3 program policy (no remotely hosted code;
single-purpose; per-permission justification; specific host patterns over
`<all_urls>`). Astra correctly avoids `<all_urls>` but bundles a broad feature
set + sensitive permissions, raising the single-purpose/justification bar. WCAG
2.2 AA adds focus-appearance and target-size criteria relevant to in-page
overlays. yt-dlp has a cookie-leak advisory class (cross-host leakage on
redirect, CVE-2023-35934) relevant to the `cookies` permission. [Verified]

## Quality & Friction Findings

Current risk status:

- **[Closed] Red CI on `main`.** The Ubuntu PyQt6 runtime failure is fixed:
  `Validate` installs the Qt runtime package set, runs with
  `QT_QPA_PLATFORM=offscreen`, performs a PyQt preflight, and passes the Python
  downloader suite on `main`. [Verified]
- **[Closed] Release-channel lag.** Public latest release is now `v4.46.0` with
  all eight profile-split extension artifacts, userscript, SBOM,
  `release-manifest.json`, and `SHA256SUMS`; release docs record the local
  `ytkit.pem` signing path. [Verified]
- **[Closed] Main branch did not require green checks.** Classic branch
  protection now records required `Validate` check contexts in
  `docs/repo-settings.md`; force-push/deletion protections and admin enforcement
  remain enabled. [Verified]
- **[Closed] Privacy/data-consent artifacts incomplete.** `docs/privacy-policy.md`
  is the stable policy source, Chrome Limited Use and data-category disclosures
  are documented, and Firefox artifacts require Firefox 140+ with generated
  `data_collection_permissions`. [Verified]
- **[High] Browser parity drift.** Firefox artifacts are built and manifest-patched,
  but no `web-ext lint` or clean-profile Firefox MV3 load gate exercises the
  artifact before AMO or self-distributed Firefox updates. → ROADMAP P1 Firefox
  parity smoke. [Verified]
- **[High] Capture coverage gaps.** The liquid-glass watch fixture is refreshed,
  but Shorts, channel, search, history, watch-later, embedded player, and
  notifications surfaces still lack capture-backed selector fixtures; the
  fixture builder currently registers only home, watch, and live-chat captures.
  → ROADMAP P2 capture-week expansion. [Verified]
- **[Med] In-page overlay accessibility.** Popup a11y/contrast is CI-gated, but
  transcript, notes, theater split, subscription manager, and toast overlays are
  not yet under the WCAG 2.2 target-size/focus-appearance gate; `audit:a11y` is
  currently popup-only. → ROADMAP P2 overlay a11y audit. [Verified]
- **[Med] Locale proofing debt.** The feature-definition i18n extraction shipped,
  but the refreshed `docs/i18n-coverage.md` reports 622-658 identical-to-English
  strings per non-EN locale, with 584 of 612 feature name/description keys still
  identical to EN. → ROADMAP P3 locale proofing queue. [Verified]
- **[Closed] Python dependency audit gap.** `Validate / Python dependency
  audit` now runs `pip-audit` against `astra_downloader/requirements.txt` and
  uploads `astra-downloader-pip-audit` JSON. The remaining dependency-security
  blocker is repository dependency-graph enablement for PR-time Dependency
  review. → ROADMAP P1 dependency graph enablement. [Verified]
- **[Gated] Downloader installer trust.** Companion onboarding is now explicit,
  but the signed installer/MSI remains blocked on signing budget and submission
  intent. → ROADMAP P2 signed installer/MSI. [Needs validation]

Closed since the 2026-06-03 baseline:

- Settings migration safety is now pinned by an old-version full-profile fixture.
  [Verified]
- Version-surface confusion was reconciled to the live v4.x ship line. [Verified]
- Settings import/export now has schema validation and credential scrub. [Verified]
- Companion onboarding, empty states, install prompt recovery, and update action
  are shipped. [Verified]
- Diagnostics export now produces a scrubbed bug-report bundle. [Verified]
- RYD estimate disclosure now appears in the UI and locale copy. [Verified]

## Architecture & Technical Findings

- **Boundaries** are clean and documented: three explicit trust boundaries,
  dual-world content scripts, bearer-token + Host-header companion. [Verified]
- **Persistence**: `chrome.storage` + `chrome.storage.session` for transient SW
  state; IndexedDB for transcripts; `unlimitedStorage`. Growth bounds for
  `videoNotesData`, `ytkit-bookmarks`, `ytkit-watch-progress`, and
  `ytkit-watch-time` now run at write time with deterministic eviction in the
  extension and userscript paths, plus an extension `storageQuotaLRU` backstop.
  [Verified]
- **Concurrency / lifecycle**: `feature-lifecycle.js`, `lifecycle-route-bridge.js`,
  and AbortController machinery shipped; per-category adoption is deferred to a
  multi-slice initiative (Existing Planned Work). [Verified]
- **Error handling**: a custom `require-catch-reason` lint rule now spans
  `core/*.js` and `ytkit.js`; silent catches must carry a `reason:`. [Verified]
- **Dependency health**: minimal npm deps (`crx3`, `eslint`); `npm audit`
  gated in CI; yt-dlp is the highest-churn dependency and now has exact
  package pins plus a monthly/manual smoke workflow that downloads a bounded
  YouTube fixture before extractor bumps are trusted. Python dependency
  vulnerability auditing now runs as a dedicated `Validate / Python dependency
  audit` job with a retained `astra-downloader-pip-audit` JSON artifact.
  Dependency review remains blocked by dependency-graph enablement rather than
  a concrete vulnerable dependency finding. [Verified]
- **Testability**: 19 spec files including hardening (474 KB),
  selector-regression, and userscript-parity; in-page overlay a11y is not yet
  automated. [Verified]
- **Dead code**: `ytkit.js` retains inline feature objects as compatibility
  fallbacks after peeling — intentional, not dead, but a long-tail cleanup target. [Likely]
- **Release automation**: `workflow_dispatch` + tag-driven CI validates,
  version-checks, builds userscript/profile artifacts, emits CycloneDX SBOM,
  generates `release-manifest.json` / `SHA256SUMS`, uploads `build/*` as a
  workflow artifact, and creates CI build/SBOM attestations on tag refs. Public
  GitHub Release publication remains maintainer-local for `ytkit.pem`-signed
  CRX artifacts; current architecture docs still need reconciliation so they do
  not imply CI itself runs `gh release create`. Firefox build is patched but not
  smoke-tested (ROADMAP P1). [Verified]

## Security / Privacy / Data Safety

- **Permission surface** [Verified]: `cookies`, `downloads`, `unlimitedStorage`,
  `storage`; 19 GitHub-full host origins incl. three AI providers, Cobalt,
  Reddit, and seven loopback ports. No `<all_urls>`; specific patterns used.
  Store-safe build artifacts now strip AI, Cobalt, and loopback grants/CSP, but
  the breadth of the full package still raises the single-purpose/justification
  bar (ROADMAP P1 store note).
- **No remote code** [Likely]: `check-no-eval.js` gate + MV3 prohibition; consistent
  with policy.
- **Credential handling** [Verified]: `policy-profile.js` now backs settings
  import/export, schema-only export, and diagnostics bundle redaction; AI keys,
  endpoint URLs, custom CSS, cookies, bearer/auth tokens, and credential-shaped
  fields must continue to route through the scrubber for any future export path.
- **Companion** [Verified]: loopback-only (`127.0.0.1`, never `localhost`),
  bearer-token, DNS-rebinding Host-header defense, yt-dlp pinned, and Flask
  `/download` request-field allowlisting that blocks client-supplied yt-dlp
  argv / flag payloads before queueing. The yt-dlp cookie-handling threat model
  is documented; signed installer/MSI trust polish remains gated.
- **Release integrity** [Verified]: v4.46.0 is the public latest release and
  attaches all eight profile-split extension artifacts, userscript, CycloneDX
  npm SBOM, `release-manifest.json`, and `SHA256SUMS`; GitHub release assets
  expose SHA-256 digest fields. The tag workflow creates attestations for
  CI-built artifacts, while public CRX assets intentionally remain
  maintainer-local because `ytkit.pem` does not enter CI.
- **Signing-key custody** [Verified]: `ytkit.pem` is ignored and untracked, but
  the local checkout contains a private-key-shaped root file and the build
  script hardcodes / auto-generates that root path. ROADMAP P0 now queues an
  external key-path contract before the next maintainer-local CRX release.
- **GitHub Actions supply chain** [Verified]: default workflow token
  permissions are read-only, but repository Actions policy still allows all
  action sources and does not require full-length SHA pins. Current workflow
  refs are tag-pinned; ROADMAP P2 now queues a post-Node-24 SHA-pinning and
  selected-actions policy pass.
- **Secret scanning** [Verified]: baseline secret scanning and push protection
  are enabled, but one open Google API Key alert remains unresolved with
  validity unknown. Non-provider pattern scanning and validity checks are
  disabled in the current repository security-analysis response.
- **Privacy disclosure / consent** [Verified]: `docs/privacy-policy.md` is the
  stable policy source linked from README/submission docs; it covers Chrome data
  categories, external destinations, local storage/export/delete, cookies, no
  telemetry/ads/sale, and Chrome Limited Use. The Firefox path is now Firefox
  140+ with generated required `data_collection_permissions`.

## UX & Accessibility

- Popup a11y + contrast are CI-gated; `docs/screen-reader-smoke.md` is a manual
  procedure. [Verified]
- In-page overlays (theater split, transcript, notes, subscription manager,
  toasts) have no automated a11y gate and are the WCAG 2.2 AA target-size /
  focus-appearance risk (ROADMAP P2). [Verified]
- House rules honored: dark/OLED, dense, no confirmation dialogs, no keyboard
  shortcuts (the `commands` surface was removed in v4.5.3). [Verified]

## Explicit Non-Goals

- `m.youtube.com` and `studio.youtube.com` support (excluded by design). [Verified]
- Keyboard shortcuts (removed in v4.5.3; must not return). [Verified]
- Remotely hosted code / analytics / opaque auto-update (trust posture). [Verified]
- Cloud account sync as a default — Astra stays local-first; any sync must be
  explicit and opt-in (contrast with PocketTube's Google-Drive sync). [Assumption]

## Open Questions

- Whether `main` should use classic branch-protection required checks or a
  repository ruleset, and whether all `main` updates should go through PRs.
  [Needs validation]
- Whether the open Google API Key secret-scanning alert is an intentional public
  YouTube/Innertube bootstrap key or a private quota-bearing credential that
  must be revoked. [Needs validation]
- Whether CRX release builds should use `ASTRA_CRX_KEY_PATH`, a CLI flag, or
  both for the external signing-key path. [Needs validation]
- Whether dependency graph / Dependabot alerts should be enabled alone first, or
  Dependabot security updates should also be enabled in the same settings pass.
  [Needs validation]
- Whether GitHub Actions migrations should jump to the latest observed majors
  (`checkout@v6`, `setup-node@v6`, `setup-python@v6`, `upload-artifact@v7`) or
  the lowest Node 24-ready majors to reduce behavior drift. [Needs validation]
- Whether GitHub Actions SHA pinning should remain coupled to the Node 24 major
  migration or land as a separate hardening PR after the action-major update.
  [Needs validation]
- Whether Firefox support should move from 128 to 140 to use built-in data
  collection consent cleanly, or keep 128-139 support with a custom
  consent/control page. [Needs validation]
- Whether Python dependency audit JSON should remain a CI artifact only or be
  attached/linkable in store or release review packets.
  [Needs validation]
- How release docs should present the split between `gh attestation verify` for
  CI-built artifacts and digest comparison for maintainer-local public release
  assets. [Needs validation]
- Downloader signing budget and CWS/AMO submission intent (gates the signed
  installer work). [Needs validation]
- Live-stream MHTML capture window for full live-chat iframe internals — repeated
  headless-capture timeouts mean this needs a manual/stable-browser save path.
  [Needs validation]
- Real-browser QA for the DOM-heuristic dead-channel staging flow, especially on
  large subscription feeds and YouTube layouts outside the current rendered-card
  selectors. [Needs validation]
- Whether the v5/v6 numbering should be retired entirely or formally re-baselined
  onto the 4.46.x line. [Needs validation]
- Lifecycle-migration cadence and which feature category owners are available for
  the paired DOM-walking peels + visible-behaviour QA. [Needs validation]
