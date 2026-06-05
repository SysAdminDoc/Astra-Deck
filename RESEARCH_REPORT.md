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

## 2026-06-05 Implementation Refresh

- [Verified] Branch-scoped CodeQL alerts from the feature branch were
  remediated beyond the earlier CSP/staging cleanup. Exact parsed YouTube host
  checks now replace substring URL handling in extension and userscript channel,
  share, video-id, and SPA navigation paths; Resume Playback Position normalizes
  stored video IDs through a bounded `Map`; Quick Links normalizes destinations
  before anchor assignment and builds SVG/label nodes with DOM APIs; the
  userscript TrustedHTML helper avoids raw `innerHTML`; transcript XML parsing
  strips tags before entity decoding and decodes `&amp;` last; build
  version-bump reads use one read helper instead of `existsSync`/read races;
  popup/i18n audit helpers avoid flagged sanitizer replacement shapes; and the
  Python folder picker writes only a generic local failure marker while
  returning a generic UI error. `tests/hardening.test.js` now pins these shapes,
  and the local verification floor passed.
- [Verified] In-page overlay accessibility coverage now extends beyond the
  popup. `npm run check` runs `npm run audit:overlays`, which statically verifies
  generated overlay semantics for toast DOM/inline fallback, downloader install
  / options / health / history surfaces, transcript viewer/search, video notes,
  and subscription group toolbar/digest/modal controls. Runtime-generated
  controls gained missing region/dialog names, polite status labels, accessible
  action names, focus-visible CSS, and explicit WCAG 2.2 24px target-size floors
  where the new gate needed deterministic coverage. Mutation canaries prove the
  audit fails for an unlabeled close button, missing `:focus-visible`, and a
  sub-24px target; manual screen-reader smoke remains for announcement quality.
- [Verified] Security disclosure is now published. Root `SECURITY.md` defines
  supported versions, private vulnerability reporting, public-issue boundaries,
  5-business-day acknowledgement and 10-business-day triage windows, and
  high-priority classes covering signing-key, extension, companion, dependency,
  release-integrity, and sensitive-export failures. README, CONTRIBUTING, the
  signing-key leak runbook, and repository-settings docs now link or reference
  that policy; private vulnerability reporting is enabled on GitHub.
- [Verified] CodeQL advanced setup is now enabled for JavaScript/TypeScript and
  Python. Hosted push run `27002182993` and pull-request run `27002184466`
  both succeeded for the language matrix, the workflow uses `security-extended`
  with generated-output path exclusions, and the code-scanning alerts API
  returns `0` open alerts.
- [Verified] Companion self-update release-channel code-side enforcement is now
  in place. Release tooling can stage a validated `AstraDownloader.exe`, require
  the EXE plus `.sha256` in `release-manifest.json` / `SHA256SUMS`, and the
  updater now fails when the sidecar is unavailable. A real PyInstaller build
  and local companion-required manifest proof succeeded; the public latest
  release still needs maintainer upload and live `gh release download`
  verification before `APP_VERSION` advances.
- [Verified] CODEOWNERS source coverage now protects high-risk repository
  paths on the feature branch. `.github/CODEOWNERS` uses the repository owner
  `@SysAdminDoc` for policy, dependency manifests, release/signing tooling,
  hardening gates, extension manifest/background/core code, and companion
  downloader paths, and the local hardening suite asserts that coverage. The
  GitHub CODEOWNERS errors API is clean for the pushed feature-branch ref. The
  remaining hosted step is to validate CODEOWNERS on the default branch and
  enable `require_code_owner_reviews` after merge.
- [Verified] Runtime-optional host permissions are now generated for store-safe
  enrichment origins. Store-safe artifacts keep YouTube hosts required, move
  SponsorBlock/DeArrow, thumbnail, Return YouTube Dislike, and Reddit hosts to
  `optional_host_permissions`, retain explicit CSP connect-src coverage for
  those hosts, and request declared optional origins from popup setting writes
  before persisting enabled state. The popup also shows a top-level Grant access
  banner when already-enabled features, including default-on SponsorBlock, need
  a runtime grant. The background `EXT_FETCH` proxy checks the current runtime
  grant before proxying optional origins, so denied or revoked grants stop
  before network fetch. The popup surfaces missing grants as permission-needed
  chips in quick toggles, schema rows, and data-flow grant labels, and shows
  exact denied-request copy. `npm run smoke:optional-hosts` now stages the
  store-safe Chromium manifest, opens the real popup in a fresh
  Chromium-family profile, and verifies the pre-grant Grant access banner lists
  all five missing runtime optional origins. Managed Google Chrome on this PC
  blocks `--load-extension`, so the smoke falls back to Edge; headed native
  prompt accept/deny/revoke remains a manual release check.
- [Verified] Companion setup documentation now separates browser install from
  the Astra Downloader local companion. README states that latest release
  `v4.46.0` lacks `AstraDownloader.exe` and
  `AstraDownloader.exe.sha256`, documents the current Windows source-checkout
  launch path, links the Downloads feature note back to companion setup, and
  frames Deno / PO-token setup as companion prerequisites. Release checklist
  docs now require README/release notes to keep that caveat until both live
  companion assets exist.
- [Verified] Hosted CodeQL PR alerts on the changed branch surface were cleaned
  up after the companion-docs push. CSP assertions now parse exact `connect-src`
  directive tokens instead of URL substrings, and companion release staging
  validates and reads `AstraDownloader.exe` from one opened descriptor before
  writing the staged build asset. Hardening coverage pins the exact-token CSP
  behavior and the no-race staging shape.

## 2026-06-04 Freshness Refresh

- [Verified] Cycle 25 companion-install-docs pass on 2026-06-04 found that
  README installation covered extension and userscript paths, while later README
  download copy depended on Astra Downloader and documented Deno / PO-token
  prerequisites without a parent companion setup section. The release-output
  list also omitted companion EXE/sidecar assets, which was truthful for latest
  release `v4.46.0` but left users without a clear companion install/update
  explanation. Cycle 2026-06-05 closed the docs gap with a standalone README
  companion setup section, live-release no-EXE/no-sidecar caveat, source-run
  path, release-checklist guardrails, and hardening coverage. The separate
  Cycle 22 EXE/sidecar release-channel proof and signed installer/MSI item
  remain open. Detailed evidence lives in
  `docs/research-cycle-25-companion-install-docs.md` and
  `docs/audit/2026-06-05-companion-install-docs.md`.
- [Verified] Cycle 24 retired-options-page copy pass on 2026-06-04 found one
  shipped runtime error that still tells users to set `aiSummaryApiKey` "via
  options page" even though v3.19.0 removed the standalone options page, the
  manifest has no `options_ui`, hardening tests pin that removal, and README
  points users to the in-page full settings panel or toolbar popup. ROADMAP now
  carries a P2 item to replace the stale copy, sync the userscript bundle, and
  add targeted copy regression coverage. Detailed evidence lives in
  `docs/research-cycle-24-retired-options-copy.md`.
- [Verified] Cycle 23 repo-working-notes pass on 2026-06-04 found that
  `AGENTS.md` delegates repo operating instructions to `CLAUDE.md`, but the
  delegated local notes pointed to a missing handoff log, carried old Firefox
  support text beside current Firefox 142+ notes, and described direct
  protected-branch release flow even though the current contract is
  protected-main PRs plus maintainer-local `ytkit.pem` signing. Cycle
  2026-06-05 closed the committed-doc gap: `AGENTS.md` now points at tracked
  loop/planning/audit files, labels ignored `CLAUDE.md` as optional local
  scratch, and sends workers to the tracked release, browser-support, and
  architecture docs. Detailed evidence lives in
  `docs/research-cycle-23-repo-working-notes-drift.md` and
  `docs/audit/2026-06-05-repo-working-notes.md`.
- [Verified] Cycle 22 companion-update release-channel pass on 2026-06-04 found
  that `/update` is implemented but the live latest release `v4.46.0` does not
  attach `AstraDownloader.exe` or `AstraDownloader.exe.sha256`. The updater
  compares against raw `main`, the build script outputs the PyInstaller EXE to
  the repo root, the release manifest generator only writes a sidecar if
  `build/AstraDownloader.exe` already exists, and the local release checklist
  had no companion EXE staging step. Cycle 2026-06-05 added the local staging
  path, companion-required manifest mode, strict updater sidecar behavior, and
  local real-EXE proof; the live release upload/dry-run remains open. Detailed
  evidence lives in
  `docs/research-cycle-22-companion-update-assets.md`.
- [Verified] Cycle 21 CODEOWNERS pass on 2026-06-04 found no CODEOWNERS file
  in `.github/`, root, or `docs/`; `main` requires one approving review but
  does not require code-owner review; the repository is a personal public repo
  owned by `@SysAdminDoc`; and the PR template has no security-sensitive-path
  review reminder. ROADMAP now carries a P2 manual-gated item to add
  `.github/CODEOWNERS` for workflows, release/signing/security policy,
  extension permission/proxy paths, and companion loopback code, then enable
  `require_code_owner_reviews` after the CODEOWNERS errors API is clean.
  Detailed evidence lives in `docs/research-cycle-21-codeowners.md`.
- [Verified] Cycle 20 optional-permissions pass on 2026-06-04 found that the
  store-safe profile split strips GitHub-full AI/Cobalt/Ollama/loopback hosts,
  but still grants optional enrichment API hosts at install time. The manifest
  builder has no `optional_host_permissions` path, there is no runtime
  `permissions.request` / `permissions.contains` helper, and tests currently
  require `i.ytimg.com`, SponsorBlock, Return YouTube Dislike, and Reddit hosts
  in store-safe `host_permissions`. Cycle 2026-06-05 closed the
  manifest/helper/background-fetch/permission-state UI slice for thumbnails,
  Return YouTube Dislike, Reddit, and SponsorBlock/DeArrow; manual browser
  smoke remains in the open P2 item. Detailed evidence lives in
  `docs/research-cycle-20-optional-permissions.md`.
- [Verified] Cycle 19 code-scanning pass on 2026-06-04 found that GitHub
  code scanning is not configured: default setup reports `state:
  not-configured`, alerts return `no analysis found`, and there is no CodeQL
  workflow or `security-events: write` job. The repo already has dependency
  audit, secret scanning, no-eval checks, and release attestations, but no
  semantic SAST layer over privileged JavaScript extension code or the Python
  companion. Cycle 2026-06-05 closed the implementation gap with advanced
  CodeQL setup for `javascript-typescript` and `python`, a clean hosted
  baseline, and advisory-only branch-protection policy until exact `main` check
  names are confirmed. Detailed evidence lives in
  `docs/research-cycle-19-code-scanning.md`.
- [Verified] Cycle 18 security-disclosure pass on 2026-06-04 found no root
  `SECURITY.md`, no `.github` security policy file, private vulnerability
  reporting disabled, and zero repository security advisories. Current
  contributor docs route bug reports through public issues, while the
  signing-key leak runbook already assumes a `SECURITY.md` section will exist.
  Cycle 2026-06-05 closed the implementation gap with a root policy, linked
  contributor docs, updated signing-key response wording, and enabled private
  vulnerability reporting. Detailed evidence lives in
  `docs/research-cycle-18-security-disclosure.md`.
- [Verified] Cycle 17 signing-key custody pass on 2026-06-04 found that
  `ytkit.pem` is not tracked by git and has no history for that path, but this
  local checkout contains an ignored private-key-shaped file in the repo root.
  Current key-management docs say the key lives outside the repo, while
  `build-extension.js` hardcodes `path.join(__dirname, 'ytkit.pem')` and
  auto-moves generated key material back into that root path. Cycle
  2026-06-05 closed the P0 implementation gap: release builds now require an
  external key path, validation/CI artifacts use explicit ephemeral signing,
  the ignored root key was moved to the default AppData key store, and
  `docs/signing-keys.md` records the expected public CRX ID without printing
  key material. Detailed evidence lives in
  `docs/research-cycle-17-signing-key-custody.md` and
  `docs/audit/2026-06-05-crx-key-custody.md`.
- [Verified] Cycle 16 GitHub Actions supply-chain policy pass on 2026-06-04
  found that repository Actions permissions are enabled but broad
  (`allowed_actions: all`) and do not require full-length SHA pins
  (`sha_pinning_required: false`). Workflows then used tag-pinned GitHub-owned
  actions across `validate.yml`, `build.yml`, and `yt-dlp-smoke.yml`; default
  `GITHUB_TOKEN` permissions were already read-only. Cycle 2026-06-05 closed
  the source-side gap by pinning every external `uses:` ref in `validate.yml`,
  `build.yml`, `yt-dlp-smoke.yml`, and `codeql.yml` to full 40-character SHAs
  with same-line version comments, including the real
  `actions/dependency-review-action` `v5.0.0` release commit. The remaining P2
  scope is to switch repository Actions permissions to selected sources with
  SHA pinning required after the branch lands and hosted workflows pass.
  Detailed evidence lives in `docs/research-cycle-16-actions-sha-pinning.md`
  and `docs/audit/2026-06-05-actions-sha-pinning.md`.
- [Verified] Cycle 15 secret-scanning pass on 2026-06-04 found one open GitHub
  secret-scanning alert in the public repository: alert 1, type
  `google_api_key`, created 2026-01-26, unresolved, `publicly_leaked: true`,
  `multi_repo: true`, and `validity: unknown`. Locations include current and
  historical generated userscript/extension files, but the secret value was not
  printed or committed during research. Cycle 2026-06-05 resolved alert 1 as
  `false_positive` after redacted triage confirmed it was an intentional public
  YouTube/Innertube bootstrap fallback rather than a private provider
  credential; active source and tracked archive snapshots were redacted, and
  `docs/repo-settings.md` records the repository endpoint no-op when attempting
  to enable validity checks and non-provider patterns. Detailed evidence lives
  in `docs/research-cycle-15-secret-scanning-alert.md` and
  `docs/audit/2026-06-05-secret-scanning-alert.md`.
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
- [Verified] Cycle 29 capture-matrix implementation on 2026-06-05 expanded the
  existing home/watch/live-chat corpus to 15 proven `SURFACE_MATCH_SOURCES`:
  `appShell`, `feed`, `feedCard`, `leftNav`, `media`, `nav`, `notifications`,
  `search`, `shortsShelf`, `thumbnail`, `mainVideo`, `player`,
  `playerChrome`, `playerSettings`, and `liveChat`. The selector regression now
  derives its expected surface list from the builder, keeps stable/fallback
  arrays synced to live packs, and fails when any registered surface loses all
  stable matches.
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
  smoke workflow; selector fixture regeneration now proves 15 home/watch/
  live-chat selector-pack chains against decoded MHTML markup; Firefox
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
Manifest V3 extension (Chrome/Edge/Brave/Firefox 142+), a Tampermonkey/Violent-
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

1. Publish the Astra Downloader self-update release assets before bumping
   companion `APP_VERSION`: upload `AstraDownloader.exe` and
   `AstraDownloader.exe.sha256` to the target latest release, then dry-run the
   live download/hash path. Code-side staging, manifest, and strict sidecar
   enforcement are already in place. [Verified]
2. Enable CODEOWNERS enforcement after merge: validate `.github/CODEOWNERS` on
   the default branch, then enable code-owner review in `main` branch
   protection. Source-side ownership coverage is already in place. [Verified]
3. Run headed unpacked Chrome/Edge plus Firefox store-safe smoke for runtime
   optional host prompt acceptance, denial, revocation, and default-on
   SponsorBlock's Grant access banner. Chromium pre-grant prompt readiness is
   now scripted with Edge fallback; code-side optional-host handling is in
   place. [Verified]
4. Enable selected GitHub Actions sources / repository SHA-pinning policy after
   the source-side full-SHA workflow refs land and hosted workflows pass.
   Workflow refs are already pinned on the feature branch. [Verified]
5. Enable dependency graph / Dependabot alert settings so the PR-only
   Dependency review job can evaluate dependency changes instead of failing on
   repository setup. [Verified]
6. Keep repo-local first-read docs aligned when release policy, Firefox support,
   or loop-state files move again. The current tracked `AGENTS.md` contract is
   reconciled with protected-main, maintainer-local release, eight-artifact, and
   Firefox 142+ guidance. [Verified]
7. After the companion EXE/sidecar release-channel proof ships, update README
   and release notes from "pending companion asset" to the verified live
   download/hash path. The current setup docs are already truthful. [Verified]
8. MHTML capture-week expansion across Shorts, channel, search, history,
   watch-later, embedded player, and notifications surfaces, including fixture
   builder and selector-match coverage for each registered pack. [Verified]
9. Locale proofing queue for identical-to-English feature names/descriptions in
   non-EN bundles; current coverage is 23.5%-27.7% translated after the generated
   feature keys landed. [Verified]
12. Signed Astra Downloader installer/MSI once the signing budget and submission
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
  `docs/research-cycle-17-signing-key-custody.md`, and
  `docs/research-cycle-18-security-disclosure.md`, and
  `docs/research-cycle-19-code-scanning.md`, and
  `docs/research-cycle-20-optional-permissions.md`, and
  `docs/research-cycle-21-codeowners.md`, and
  `docs/research-cycle-22-companion-update-assets.md`, and
  `docs/research-cycle-23-repo-working-notes-drift.md`, and
  `docs/research-cycle-24-retired-options-copy.md`, and
  `docs/research-cycle-25-companion-install-docs.md`. [Verified]
- Companion install-docs probe: README installation now separates browser
  extension/userscript install from Astra Downloader setup, labels
  `AstraDownloader.exe` and sidecar assets as absent from latest release
  `v4.46.0`, and signing-key docs guard README/release-note claims against the
  live asset state. [Verified]
- Retired options-page copy probe: `extension/ytkit.js` still throws
  `Set aiSummaryApiKey first (via options page)` on the summary-provider
  missing-key path, while `extension/manifest.json` has `action.default_popup =
  "popup.html"` and no `options_ui`; hardening tests assert the options page is
  removed; README points users to the YouTube gear icon or toolbar popup `Open
  Full Settings` action. [Verified]
- Repo working-notes drift probe: `AGENTS.md` no longer delegates committed
  first-read source-of-truth status to ignored `CLAUDE.md`. It now points at
  tracked loop/planning/audit, architecture, signing-key, and release docs, and
  labels `CLAUDE.md` as optional local scratch. [Verified]
- Companion update release-channel probe: `astra_downloader/astra_downloader.py`
  keeps `APP_VERSION = "1.5.1"`, reads the latest version from raw `main`, and
  points update downloads at `/releases/latest/download/AstraDownloader.exe` and
  `.sha256`; latest release `v4.46.0` has no `AstraDownloader.exe` or sidecar;
  `astra_downloader/build.py` outputs the EXE to the repo root; the release
  manifest generator only emits `AstraDownloader.exe.sha256` when
  `build/AstraDownloader.exe` already exists; the tag workflow uploads `build/*`
  from Ubuntu without a Windows companion build; and local release docs have no
  companion EXE staging step. [Verified]
- CODEOWNERS probe: `.github/CODEOWNERS`, root `CODEOWNERS`, and
  `docs/CODEOWNERS` are absent; `gh repo view SysAdminDoc/Astra-Deck --json
  owner,viewerPermission` reports owner `SysAdminDoc` and viewer permission
  `ADMIN`; branch pull-request review protection reports
  `required_approving_review_count: 1` and `require_code_owner_reviews: false`;
  the CODEOWNERS errors endpoint returns 404 while no CODEOWNERS file exists;
  and `.github/pull_request_template.md` contains generic Summary/Changes/
  Testing sections without a security-sensitive-path review reminder.
  [Verified]
- Runtime optional-permissions probe: `extension/manifest.json:31` defines
  install-time host permissions and lines 35-39 include optional enrichment
  hosts; `build-extension.js:258` through `build-extension.js:287` generate
  profile `host_permissions` and CSP without an `optional_host_permissions`
  path; `extension/core/data-flow.js:46`, `:54`, `:62`, and `:70` map those
  hosts to feature keys; and hardening tests currently require store-safe
  install-time inclusion for the same hosts. [Verified]
- Security disclosure probe: no root `SECURITY.md` or `.github` security-policy
  file exists; private vulnerability reporting returns `enabled: false`; public
  issue templates are the only visible reporting path; and the repository has
  zero security advisories. GitHub docs say a security policy gives reporting
  instructions, and private vulnerability reporting gives researchers a
  structured private path in public repositories. [Verified]
- CRX signing-key custody probe: `ytkit.pem` is ignored by `.gitignore` and is
  not tracked in current git state, but the local checkout has a 1732-byte
  private-key-shaped root file. `docs/signing-keys.md` says the key lives
  outside the repo, while `build-extension.js` hardcodes the repo-root
  `ytkit.pem` path and moves generated key material there if no key exists.
  The key body was not printed. Cycle 2026-06-05 moved the local ignored root
  key to the external AppData key store and removed the build-script root-key
  fallback. [Verified]
- GitHub Actions policy probe: repository Actions permissions are currently
  `allowed_actions: all` and `sha_pinning_required: false`; workflow defaults
  keep `GITHUB_TOKEN` read-only and prevent workflow-created PR approvals.
  Earlier workflows contained tag-pinned GitHub-owned action refs across
  `Validate`, `Build & Release`, and `yt-dlp Smoke`; Cycle 2026-06-05 pinned
  those refs plus CodeQL to full 40-character SHAs. GitHub's secure-use docs
  say full-length commit SHAs are the immutable action-reference option, and
  repository settings / REST APIs can require SHA pins and selected action
  sources. [Verified]
- Secret scanning alert probe: alert 1 was resolved as `false_positive` on
  2026-06-05 after redacted triage confirmed the value was a public
  YouTube/Innertube bootstrap fallback. Open alert count is now `0`. Secret
  scanning and push protection are enabled, while non-provider pattern scanning
  and validity checks remain disabled after repository PATCH attempts returned
  successfully but left both statuses unchanged. [Verified]
- Open Dependabot PR #11 and run `26950993002`: Dependency review fails with
  GitHub's dependency-graph enablement message while the other `Validate` jobs
  pass. The repository security-analysis API response shows a public repository
  with Dependabot security updates disabled and no dependency-graph field in the
  returned block. [Verified]
- Current workflow action-runtime probe: `gh run view 26953094214 --log` and
  `gh run view 26951406026 --log` both emit GitHub's Node 20 JavaScript action
  deprecation warning on the earlier workflow runs. Cycle 2026-06-05 migrated
  `.github/workflows/validate.yml`, `build.yml`, and `yt-dlp-smoke.yml` to
  `actions/checkout@v6`, `actions/setup-node@v6`,
  `actions/setup-python@v6`, and `actions/upload-artifact@v7`; a hardening
  regression now blocks the old Node 20-era pins from returning. [Verified]
- Release contract reconciliation probe: `.github/workflows/build.yml` uploads
  `build/*` as a workflow artifact and creates CI build/SBOM attestations on tag
  refs, while `docs/signing-keys.md` says public GitHub Releases remain a
  maintainer-local upload path because `ytkit.pem` never enters CI.
  Cycle 2026-06-05 reconciled `docs/architecture.md` so the CI row names upload
  artifacts and tag-only attestations instead of `gh release create`. [Verified]
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
- **[High] Companion self-update release assets unpublished.** The code-side
  release-channel contract now stages the EXE, requires the generated sidecar
  in release manifests/checksums, and fails `/update` when the sidecar is
  missing. The latest public release `v4.46.0` still has no
  `AstraDownloader.exe` or `.sha256` asset, so the remaining P1 work is
  maintainer release upload plus live download/hash proof before any
  `APP_VERSION` bump. [Verified]
- **[Closed] Repo-local working notes drift.** `AGENTS.md` now points future
  workers at tracked loop/planning/audit, architecture, signing-key, and release
  docs, and labels ignored `CLAUDE.md` as optional local scratch rather than the
  committed source of truth. [Verified]
- **[Closed] Companion setup docs gap.** README now has a distinct Astra
  Downloader companion setup section, labels the latest release no-EXE/no-sidecar
  state, documents the source-checkout launch path, and frames Deno / PO-token
  setup as companion prerequisites. The remaining companion risk is release
  upload/dry-run proof, tracked separately as the high-priority self-update
  release-asset item. [Verified]
- **[Med] Retired settings-surface copy.** The standalone options page is
  removed and tested as absent, but the summary-provider key error still tells
  users to use an options page. → ROADMAP P2 retired options-page copy fix.
  [Verified]
- **[Closed] Main branch did not require green checks.** Classic branch
  protection now records required `Validate` check contexts in
  `docs/repo-settings.md`; force-push/deletion protections and admin enforcement
  remain enabled. [Verified]
- **[Closed] Privacy/data-consent artifacts incomplete.** `docs/privacy-policy.md`
  is the stable policy source, Chrome Limited Use and data-category disclosures
  are documented, and Firefox artifacts require Firefox 142+ with generated
  `data_collection_permissions`. [Verified]
- **[Closed] Browser parity drift.** `web-ext@10.3.0` is exact-pinned,
  `npm run check` now stages and lints both Firefox profile manifests with zero
  `web-ext lint` errors/warnings/notices, and the tag release workflow installs
  Firefox via a pinned setup action before running a clean-profile store-safe
  smoke on a stable YouTube watch URL. [Verified]
- **[High] Capture coverage gaps.** The liquid-glass watch fixture is refreshed
  and the existing home/watch/live-chat corpus now proves 15 selector-pack
  surfaces, but dedicated Shorts, channel, search-results, history,
  watch-later, embedded-player, and notifications-menu captures are still
  missing. The current watch capture does not prove stable matches for
  `profile` / `channelProfile`, `sidebar`, `relatedSidebar`, or `watch`, so
  those remain in the capture-week backlog instead of being promoted from weak
  evidence. → ROADMAP P2 capture-week expansion. [Verified]
- **[Closed] In-page overlay accessibility.** `npm run check` now includes
  `audit:overlays`, covering generated overlay names, dialog/region semantics,
  live-region behavior, focus-visible rules, and WCAG 2.2 target-size floors
  beyond the popup. [Verified]
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
- **Semantic source scanning**: GitHub code scanning is not configured for the
  current JavaScript/Python source tree. The repository has narrow bespoke
  checks such as `check-no-eval.js`, but no CodeQL Security-tab baseline for
  message-passing, DOM/TrustedHTML, request-forgery, Flask route, subprocess,
  or local-token data flows. ROADMAP P1 now queues CodeQL for JavaScript and
  Python. [Verified]
- **Path-aware review ownership**: `main` requires one approving review but
  no CODEOWNERS file exists and code-owner review is disabled. ROADMAP P2 now
  queues CODEOWNERS coverage for security-sensitive workflows, release/signing
  docs, extension permission/proxy paths, and companion loopback code before
  enabling `require_code_owner_reviews`. [Verified]
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
  CRX artifacts; current architecture docs now mirror that split and no longer
  imply CI itself runs public release publication. Firefox build is patched but not
  smoke-tested (ROADMAP P1). Companion self-update assets are not yet part of
  this release contract because `AstraDownloader.exe` is built to the repo root
  and the manifest generator only covers it after it is staged into `build/`
  (ROADMAP P1). [Verified]
- **Repo working notes**: `AGENTS.md` makes `CLAUDE.md` the first-read working
  note source, but `CLAUDE.md` still mixes current 2026-06-04 notes with old
  release and Firefox support statements. ROADMAP P2 now queues a docs-only
  reconciliation so first-read instructions match the current release and
  browser-support contracts. [Verified]
- **Settings surfaces**: the toolbar popup and in-page settings panel are the
  current settings paths, and tests assert the standalone options page remains
  removed. One runtime summary-provider error still names that removed surface;
  ROADMAP P2 now queues the copy fix and regression. [Verified]
- **Companion onboarding docs**: in-app setup prompts are shipped, but README
  installation docs do not yet describe the companion install/release-asset
  state before users reach the app. ROADMAP P2 now queues a truthful README /
  release-doc section that stays separate from signed MSI and self-update work.
  [Verified]

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
  is documented; signed installer/MSI trust polish remains gated, and the
  companion self-update release channel still needs EXE/sidecar publication
  proof before `APP_VERSION` moves.
- **Release integrity** [Verified]: v4.46.0 is the public latest release and
  attaches all eight profile-split extension artifacts, userscript, CycloneDX
  npm SBOM, `release-manifest.json`, and `SHA256SUMS`; GitHub release assets
  expose SHA-256 digest fields. The tag workflow creates attestations for
  CI-built artifacts, while public CRX assets intentionally remain
  maintainer-local because `ytkit.pem` does not enter CI. The latest release
  does not attach the companion EXE or `.sha256` sidecar, so companion
  self-update integrity remains a separate P1 release-channel item.
- **Signing-key custody** [Verified]: the P0 repo-worktree custody gap is now
  closed. Release builds require an external `ASTRA_CRX_KEY_PATH` / default
  local key store or `--crx-key`, validation builds use ephemeral CRX signing,
  the root `ytkit.pem` file is absent from the checkout, and the public CRX ID
  baseline is documented for pre-publication comparison.
- **Security disclosure** [Verified]: root `SECURITY.md` is present, private
  vulnerability reporting is enabled, and README/CONTRIBUTING route sensitive
  reports away from public issues. The policy names supported versions,
  response windows, high-priority classes, and data that reporters should not
  paste into public issues.
- **Code scanning** [Verified]: advanced CodeQL setup exists in
  `.github/workflows/codeql.yml` and `.github/codeql.yml`; hosted push and PR
  baselines succeeded for `javascript-typescript` and `python`; and open
  code-scanning alerts are `0`. CodeQL remains advisory-only until exact
  protected-branch check contexts are confirmed on `main` or the next PR.
- **Code-owner review** [Verified]: branch protection already requires one
  approving review, conversation resolution, admin enforcement, and green
  required checks, but no CODEOWNERS file exists and branch protection does not
  require code-owner review. ROADMAP P2 now queues `.github/CODEOWNERS` plus a
  clean CODEOWNERS errors API result before enforcement.
- **GitHub Actions supply chain** [Verified]: default workflow token
  permissions are read-only, and current workflow refs are pinned to full
  40-character SHAs with same-line version comments. Repository Actions policy
  still allows all action sources and does not require full-length SHA pins, so
  ROADMAP P2 now queues the hosted selected-actions and required-SHA policy
  pass after merge.
- **Secret scanning** [Verified]: baseline secret scanning and push protection
  are enabled, alert 1 is resolved as `false_positive`, open alert count is `0`,
  and active source/archive snapshots no longer contain Google API-key-shaped
  literals. Non-provider pattern scanning and validity checks remain disabled
  after repository PATCH attempts left both statuses unchanged.
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
- Whether dependency graph / Dependabot alerts should be enabled alone first, or
  Dependabot security updates should also be enabled in the same settings pass.
  [Needs validation]
- Whether CodeQL should become a required `main` status immediately after it
  succeeds on `main`, or remain advisory for one week to capture false
  positives. [Needs validation]
- Whether GitHub Actions selected-actions / required-SHA enforcement should be
  flipped through the repository UI or REST API immediately after this branch
  lands and hosted workflows pass. [Needs validation]
- Whether Firefox support should move from 128 to 140 to use built-in data
  collection consent cleanly, or keep 128-139 support with a custom
  consent/control page. [Needs validation]
- Whether Python dependency audit JSON should remain a CI artifact only or be
  attached/linkable in store or release review packets.
  [Needs validation]
- Whether CodeQL should become a required `main` check immediately after first
  success or remain advisory until the initial JavaScript/Python baseline is
  triaged. [Needs validation]
- Whether CodeQL should start with `security-extended` only or include
  `security-and-quality` after measuring runtime and false-positive volume.
  [Needs validation]
- Whether to add side-by-side command examples for `gh attestation verify` on
  CI-built artifacts and `gh release view --json assets` digest comparison for
  maintainer-local public release assets. The core release-doc split is now
  documented in `docs/architecture.md` and `docs/signing-keys.md`. [Needs validation]
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
