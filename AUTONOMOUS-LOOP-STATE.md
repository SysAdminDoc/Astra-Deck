# Autonomous Loop State

## Current Project

- Project: Astra Deck
- Path: `\\vmware-host\Shared Folders\repos\Astra-Deck`
- Branch: `codex/research-feature-plan-2026-06-05`
- Last cycle: 2026-06-06
- Result: Shipped the retired options-page runtime-copy fix for the AI summary
  missing-key path, then reconciled release automation docs with the
  maintainer-local public-release contract, then migrated GitHub-owned workflow
  action pins to Node 24-ready majors, then moved CRX signing-key custody out
  of the repo worktree with an external release-key contract, then triaged and
  resolved the Google API-key secret-scanning alert without exposing the value,
  then published the security disclosure policy and enabled private
  vulnerability reporting, then added and baseline-verified CodeQL
  JavaScript/TypeScript plus Python code scanning, then hardened the
  Astra Downloader self-update release-channel contract up to the public
  release-upload boundary, then added CODEOWNERS source coverage for
  security-sensitive repository, release, extension core, and companion paths,
  then moved default-off store-safe enrichment hosts to runtime optional grants
  with a popup request guard, then enforced current runtime optional-host grants
  in the background fetch proxy before network requests to those optional
  origins, then surfaced denied/revoked runtime optional-host state in popup
  quick toggles, schema rows, and data-flow labels, then moved the shared
  SponsorBlock/DeArrow host to store-safe runtime optional grants with a popup
  Grant access banner for already-enabled features, then pinned all external
  GitHub Actions workflow refs in validation, release, yt-dlp smoke, and CodeQL
  workflows to full-length SHAs with same-line version comments. The
  dependency-review job now points at the real upstream `v5.0.0` release commit
  instead of the nonexistent `v5` tag. Updated roadmap/completed/audit
  continuity notes after each cycle, then clarified the Astra Downloader
  companion setup path in the README and signing/release guardrails: the latest
  public release `v4.46.0` still lacks `AstraDownloader.exe` and
  `AstraDownloader.exe.sha256`, source-checkout Windows runs stay available via
  Python, PO-token and Deno setup are framed as companion prerequisites, and
  future release docs must mention the EXE only with its SHA-256 sidecar. The
  companion EXE upload/dry-run remains a release-maintainer boundary, while
  resolving the hosted CodeQL PR alerts that appeared after the companion-docs
  push: CSP hardening assertions now parse exact `connect-src` tokens instead
  of URL substrings, and companion release staging validates and reads the EXE
  from one opened descriptor before writing the staged build asset. Repository
  working notes were then reconciled with the current protected-main,
  maintainer-local release, eight-artifact, and Firefox 142+ contracts:
  `AGENTS.md` now points at tracked loop/planning/audit files, names the release
  policy sources, and labels ignored `CLAUDE.md` as optional local scratch
  rather than committed source of truth. The in-page overlay WCAG 2.2 gate was
  then shipped: `npm run check` now runs `audit:overlays`, generated overlay
  controls gained missing names, live-status labels, focus-visible styling, and
  24px-plus target floors, and mutation canaries prove the audit fails for
  unlabeled close buttons, missing focus-visible rules, and sub-24px controls.
  The Firefox MV3 release gate was then shipped: `web-ext@10.3.0` is
  exact-pinned, `npm run check` now stages and lints both Firefox profile
  manifests with zero `web-ext` findings, the release workflow installs Firefox
  through pinned `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`
  before running a clean-profile store-safe smoke after artifact generation, and
  the first gate run fixed non-square PNG icons, the Firefox 142+
  data-consent floor, and remaining raw TrustedHTML `innerHTML` sinks. Chromium
  optional-host prompt readiness was then scripted: `npm run
  smoke:optional-hosts` stages the store-safe Chromium manifest, opens the real
  popup in a fresh profile, seeds enabled optional enrichment features, and
  verifies the Grant access banner lists all five missing runtime optional
  origins before any grant is accepted. Managed Google Chrome on this PC blocks
  `--load-extension`, so the smoke falls back to Edge; headed prompt
  accept/deny/revoke remains a manual release check. The MHTML selector fixture
  matrix was then expanded over the existing home/watch/live-chat local capture
  corpus: `SURFACE_MATCH_SOURCES` now covers 15 proven surfaces, the regression
  derives its expected surface list from the builder, and every registered
  surface must keep at least one matched stable selector. That first matrix pass
  left dedicated Shorts, channel, search-results, history, watch-later,
  embed-player, and notifications-menu captures open in the capture-week
  backlog. The
  branch-scoped CodeQL alerts exposed after that push were then remediated
  across exact URL host/scheme parsing, Resume Playback Position storage,
  YouTube-local Quick Links URL normalization and DOM construction, userscript
  parser-helper removal, transcript entity/tag parsing, version-bump file
  reads, audit-helper sanitizer shapes, and generic folder-picker UI
  errors/local failure markers, with hardening tests added for each alert
  class. The capture-week backlog was then advanced again: `npm run
  capture:surface` now provides public `shorts`, `search`, `channel`, and
  `embed` Chrome DevTools profiles, derived token fixtures were committed for
  `Shorts`, `SearchResults`, `Channel`, and `EmbedPlayer`, and
  `selector-surface-matches.json` now proves required selectors for those
  capture IDs. History and Watch Later remained account-gated in the current
  unauthenticated profile, and open notifications still need a clicked
  menu-state capture. The next roadmap-only pass then added Cycle 32 and Cycle
  33 research: Cycle 32 reframed the remaining selector fixture work as a safe
  authenticated/menu-state capture lane with auth/profile state outside the
  repo, and Cycle 33 reframed the hosted/manual security residue as a
  post-merge closure runbook before dependency graph, CODEOWNERS enforcement,
  selected Actions, SHA-pinning, or release-asset settings are mutated. A live
  `gh api` refresh for hosted settings and release assets timed out after 34
  seconds in this environment, so those hosted claims must be refreshed before
  acting. Cycle 34 then delivered `docs/hosted-policy-closure.md` and refreshed
  hosted read-only state successfully: Actions remain `allowed_actions: all`
  with `sha_pinning_required: false`, workflow token defaults remain read-only,
  Dependabot security updates remain disabled, `main` still does not require
  code-owner reviews, default-branch CODEOWNERS validation still returns `404`,
  and release `v4.46.0` still lacks `AstraDownloader.exe` plus
  `AstraDownloader.exe.sha256`. The runbook also records that
  `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795` is
  the only non-GitHub-owned workflow action and must be explicitly allowlisted
  before selected-actions enforcement. Cycle 35 then converted the remaining
  authenticated/menu-state selector work into an implementation contract in
  `docs/research-cycle-35-authenticated-capture-implementation-plan.md`: add
  `history`, `watch-later`, and `notifications` capture profiles to the
  current CDP helper; use an absolute external Chrome profile path through
  `--user-data-dir` or `ASTRA_CAPTURE_PROFILE_DIR`; reject any profile/auth
  path under the repo; fail before writing MHTML when auth is missing, Watch
  Later is empty, or the notifications menu cannot expose
  `ytd-notification-renderer`; and add fixture-builder/test registrations only
  atomically with derived token fixtures that prove stable matches. Cycle 36
  then delivered that helper-only safety slice: `scripts/capture-watch-mhtml.js`
  now has the authenticated profiles, external profile path support, repo-path
  refusal, auth/content checks, notification menu opener, and one-line
  parse-time safety errors; `.gitignore` blocks common auth/profile artifacts;
  `docs/selector-fixture-workflow.md` documents the authenticated CDP path; and
  `tests/selector-regression.test.js` covers the deterministic negative paths
  without launching Chrome. Cycle 37 then extended the Chromium optional-host
  smoke beyond pre-grant readiness: `--headed --expect-deny` now asserts that a
  denied prompt leaves missing grants visible with explicit host-access copy,
  and `--headed --attempt-grant --revoke-after-grant` accepts the prompt,
  removes the accepted origins through `chrome.permissions.remove()`, and
  verifies the popup returns to the permission-needed state. The default
  headless smoke remains readiness-only with managed Chrome policy fallback to
  Edge. Cycle 38 then added a headed Firefox optional-host prompt harness:
  `npm run smoke:firefox -- --headed --manual-optional-hosts` maps the staged
  Gecko id to a stable internal UUID, opens the popup directly at a
  `moz-extension://` URL, keeps Firefox headed, prints expected optional
  origins, and records the accept/deny/revoke operator checklist. The local
  machine has no Firefox executable on the searched paths, so no native Firefox
  prompt pass is claimed for this cycle. Cycle 39 then added a deterministic
  Actions selected-policy payload generator: `npm run policy:actions` scans the
  workflow inventory, rejects non-SHA or no-version-comment action refs, and
  emits the hosted permissions payload plus selected-actions allowlist. The
  current source inventory has GitHub-owned actions allowed, verified creators
  disabled, and only the pinned `browser-actions/setup-firefox` ref in
  `patterns_allowed`. Cycle 40 then guarded the PR-only Dependency review job
  while dependency graph remains hosted-gated: `Validate / Dependency review`
  is advisory unless repository variable `DEPENDENCY_REVIEW_REQUIRED` is
  exactly `true`, then it enforces the existing `fail-on-severity: moderate`
  policy. Cycle 41 then added a generated release-readiness report:
  `npm run release:readiness` writes JSON/Markdown under
  `build/release-readiness/` and checks version surfaces, release-manifest /
  SHA256SUMS / SBOM proof, expected artifact inventory, root signing-key
  absence, local signing policy, and companion EXE/sidecar truth before release
  upload.
  Repository selected-actions and required-SHA settings remain a hosted
  follow-up after merge.

## Verification

- Full-cycle verification passed:
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 27 Firefox release-gate verification passed:
  - `npm run check:firefox`
  - `npm run smoke:firefox` (Firefox 151.0.3; store-safe MV3 staged manifest;
    Gecko ID `ytkit@sysadmindoc.github.io`; clean 25-second startup window)
  - `node --test tests/firefox-injection-audit.test.js`
  - `node --test tests/hardening.test.js --test-name-pattern="Firefox|manifest PNG|TrustedTypes|workflow actions"`
- Cycle 28 Chromium optional-host prompt-readiness verification passed:
  - `npm run smoke:optional-hosts` (Google Chrome policy blocked
    `--load-extension`; Microsoft Edge loaded the staged store-safe popup and
    reported five missing runtime optional origins before grant)
  - `node --test tests/optional-host-smoke.test.js`
- Cycle 37 Chromium optional-host prompt-state verification passed:
  - `node --check scripts/smoke-chromium-optional-hosts.js`
  - `node --check extension/core/optional-host-permissions.js`
  - `node --test tests/optional-host-smoke.test.js`
  - `node --test tests/hardening.test.js --test-name-pattern "optional host permission helper"`
  - `node sync-userscript.js`
  - `npm run smoke:optional-hosts` (Google Chrome policy blocked
    `--load-extension`; Microsoft Edge loaded the staged store-safe popup and
    reported five missing runtime optional origins before grant)
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Cycle 38 Firefox optional-host prompt-harness verification:
  - `node --check scripts/smoke-firefox-webext.js`
  - `node --test tests/firefox-injection-audit.test.js`
  - `npm run smoke:firefox` was attempted and failed before launch with
    `Firefox executable not found. Install Firefox or pass --firefox <path>.`
    No native Firefox prompt result is claimed.
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Cycle 39 Actions selected-policy payload verification:
  - `node --check scripts/generate-actions-policy.js`
  - `node --test tests/actions-policy.test.js`
  - `npm run policy:actions`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Cycle 40 Dependency review advisory-gate verification:
  - `node --test tests/dependency-review-policy.test.js`
  - `node --test tests/actions-policy.test.js`
  - `npm run policy:actions`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Cycle 41 Release readiness report verification:
  - `node --check scripts/generate-release-readiness.js`
  - `node --test tests/release-readiness.test.js`
  - `node --test tests/hardening.test.js --test-name-pattern="release manifest generation"`
  - `npm run release:readiness` produced the expected validation-build FAIL
    report before release manifest / SBOM / SHA256SUMS proof existed.
  - `ASTRA_CRX_KEY_MODE=ephemeral npm run build:userscript`
  - `npm sbom --omit=dev --sbom-format cyclonedx > build/astra-deck-npm-sbom.cdx.json`
  - `npm run release:manifest`
  - `npm run release:readiness -- --require-pass` produced a PASS report with
    12 passing checks.
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Cycle 29 selector fixture matrix verification passed:
  - `npm run build:fixtures`
  - `node --test tests/selector-regression.test.js`
  - Generated `tests/fixtures/selector-surface-matches.json` now records stable
    matches for `appShell`, `feed`, `feedCard`, `leftNav`, `media`, `nav`,
    `notifications`, `search`, `shortsShelf`, `thumbnail`, `mainVideo`,
    `player`, `playerChrome`, `playerSettings`, and `liveChat`.
- Cycle 30 branch CodeQL alert remediation verification passed:
  - `node --check extension/ytkit.js`
  - `node --check YTKit.user.js`
  - `node --check build-extension.js`
  - `node --check extension/core/transcript-service.js`
  - `node --check scripts/audit-popup-a11y.js`
  - `node --check scripts/extract-i18n-keys.js`
  - `python -m py_compile astra_downloader\astra_downloader.py`
  - `node --test tests/core-transcript-service.test.js tests/hardening.test.js tests/userscript-health.test.js`
  - `python -m pytest astra_downloader\test_astra_downloader.py -q -k "FolderPickerService or GuiSmoke"`
  - `npm run audit:a11y`
  - `node --test tests/hardening.test.js`
  - `npm test`
  - `python -m pytest astra_downloader\test_astra_downloader.py -q`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - Hosted follow-up after `ff724d2`: branch-scoped CodeQL alert query for
    `refs/heads/codex/research-feature-plan-2026-06-05` returned `0`; PR
    checks passed for CodeQL, JS tests/check, Python dependency audit, and
    Python downloader tests. Dependency review remains failed because the
    repository dependency graph is not enabled.
- Cycle 31 public selector capture-week verification passed:
  - `node --check scripts/capture-watch-mhtml.js`
  - `node --check scripts/build-selector-fixtures.js`
  - `npm run capture:surface -- --surface search --timeout-ms 30000`
  - `npm run capture:surface -- --surface channel --timeout-ms 30000`
  - `npm run capture:surface -- --surface embed --timeout-ms 30000`
  - Shorts captured with the same helper against `https://www.youtube.com/shorts`
    and required `ytd-reel-video-renderer`.
  - History and Watch Later probes were attempted without auth and did not
    expose feed/playlist card selectors.
  - `npm run build:fixtures`
  - `node --test tests/selector-regression.test.js`
- Cycle 32/33 roadmap research verification:
  - Read `scripts/capture-watch-mhtml.js`,
    `scripts/build-selector-fixtures.js`, `docs/selector-fixture-workflow.md`,
    `docs/repo-settings.md`, `ROADMAP.md`, and this loop state.
  - External docs reviewed: Chrome DevTools Protocol `Page.captureSnapshot`,
    Playwright authentication storage-state guidance, GitHub dependency review,
    GitHub CODEOWNERS, GitHub Actions permissions REST API, and GitHub Actions
    secure-use guidance.
  - `gh api` read-only refresh attempts for Actions permissions, security
    analysis, branch review policy, and `v4.46.0` release assets timed out after
    34 seconds; no hosted settings were changed.
  - `ROADMAP.md` now has a `Continuation State` section naming Cycle 34 next
    actions.
- Cycle 34 hosted-policy runbook verification:
  - Read `.github/workflows/validate.yml`, `.github/workflows/build.yml`,
    `.github/workflows/codeql.yml`, `.github/workflows/yt-dlp-smoke.yml`,
    `.github/CODEOWNERS`, `.github/dependabot.yml`, `.github/codeql.yml`, and
    `docs/repo-settings.md`.
  - `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq
    '{enabled,allowed_actions,sha_pinning_required,selected_actions_url}'`
    returned `allowed_actions: all` and `sha_pinning_required: false`.
  - `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/workflow --jq .`
    returned read-only workflow token defaults and disabled workflow-created PR
    approvals.
  - `gh api repos/SysAdminDoc/Astra-Deck --jq
    '{private,security_and_analysis:.security_and_analysis}'` returned a public
    repository with Dependabot security updates disabled and no dependency graph
    field in the returned block.
  - `gh api
    repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews
    --jq '{required_approving_review_count,require_code_owner_reviews}'`
    returned one required approving review and code-owner reviews disabled.
  - `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq .` returned
    `404 Not Found` on the default branch.
  - `gh release view v4.46.0 --repo SysAdminDoc/Astra-Deck --json
    tagName,publishedAt,assets,url` returned 12 assets and no companion EXE or
    sidecar.
  - `rg -n
    "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)|uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v"
    .github\workflows` confirmed SHA-pinned workflow refs and exposed
    `browser-actions/setup-firefox` as the only non-GitHub-owned action.
  - Added `docs/hosted-policy-closure.md` and
    `docs/research-cycle-34-hosted-policy-runbook.md`; updated
    `docs/repo-settings.md`, `ROADMAP.md`, and `RESEARCH_REPORT.md`.
- Cycle 35 authenticated-capture implementation-plan verification:
  - Read `scripts/capture-watch-mhtml.js`, `scripts/build-selector-fixtures.js`,
    `tests/selector-regression.test.js`, `docs/selector-fixture-workflow.md`,
    `.gitignore`, `package.json`, `extension/core/selector-packs/notifications.js`,
    `extension/core/selector-packs/feed.js`,
    `extension/core/selector-packs/feedCard.js`, and
    `extension/core/selector-packs/leftNav.js`.
  - External docs reviewed: Chrome DevTools Protocol `Page.captureSnapshot` and
    Playwright authenticated state guidance.
  - Added `docs/research-cycle-35-authenticated-capture-implementation-plan.md`;
    updated `ROADMAP.md`, `RESEARCH_REPORT.md`, and this loop state.
- Cycle 36 authenticated-capture helper-safety verification:
  - `node --check scripts/capture-watch-mhtml.js`
  - `node --check scripts/build-selector-fixtures.js`
  - `node --test tests/selector-regression.test.js`
  - `cmd.exe /v:on /d /c 'pushd "\\vmware-host\Shared Folders\repos\Astra-Deck" && (npm run capture:surface -- --surface history & set "code=!errorlevel!" & popd & exit /b !code!)'`
    returned non-zero with the expected one-line auth-required message. A direct
    UNC `npm run` remains invalid because Windows `cmd.exe` defaults UNC working
    directories to `C:\Windows`, so the verification used transient `pushd`.
  - `cmd.exe /v:on /d /c 'pushd "\\vmware-host\Shared Folders\repos\Astra-Deck" && (npm run capture:surface -- --surface history --user-data-dir "\\vmware-host\Shared Folders\repos\Astra-Deck\.auth" & set "code=!errorlevel!" & popd & exit /b !code!)'`
    returned non-zero with the expected repo-worktree refusal, proving the
    helper rejects a UNC repo-local profile path even when `cmd pushd` maps the
    repo to a temporary drive letter.
  - `git status --ignored --short -- mhtml playwright .auth capture-profiles`
    reported `!! mhtml/`; raw MHTML remains ignored.
  - Added `docs/research-cycle-36-authenticated-capture-helper-safety.md`;
    updated `.gitignore`, `docs/selector-fixture-workflow.md`,
    `scripts/capture-watch-mhtml.js`, `tests/selector-regression.test.js`,
    `ROADMAP.md`, `RESEARCH_REPORT.md`, and this loop state.
- Focused verification passed:
  `node --test tests/hardening.test.js --test-name-pattern="runtime settings guidance|standalone options page"`.
- Cycle 2 release-doc verification passed:
  - `gh release view v4.46.0 --json tagName,targetCommitish,publishedAt,assets,url`
  - `gh run view 26951406026 --json databaseId,event,headBranch,headSha,conclusion,status,url,jobs`
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 3 Node 24 action-major verification passed:
  - `node --test tests/hardening.test.js --test-name-pattern="GitHub workflows use Node 24-ready"`
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 4 CRX key-custody verification passed:
  - `node --test tests/hardening.test.js --test-name-pattern="CRX signing key custody"`
  - missing-key release build failure check with a temporary missing `ASTRA_CRX_KEY_PATH`
  - `npm run build:userscript -- --profile store-safe`
  - `Test-Path ytkit.pem` returned `False`
  - `git status --ignored --short -- ytkit.pem` returned no root key entry
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 5 secret-scanning verification passed:
  - redacted current-tree scan for `AIza[0-9A-Za-z_-]{35}`
  - `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts/1 --jq ...`
  - `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts?state=open --paginate --jq 'length'`
  - `gh api repos/SysAdminDoc/Astra-Deck --jq ".security_and_analysis"`
  - `node --test tests/core-transcript-service.test.js --test-name-pattern="Innertube API method requires"`
  - `node --test tests/hardening.test.js --test-name-pattern="Google API key literals"`
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 6 security-disclosure verification passed:
  - `Test-Path SECURITY.md`
  - `rg -n "Report a vulnerability|private vulnerability|security advisory|supported versions|public issues" SECURITY.md README.md CONTRIBUTING.md docs/signing-keys.md docs/repo-settings.md`
  - `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq .enabled`
  - `gh api repos/SysAdminDoc/Astra-Deck/security-advisories --jq length`
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 7 CodeQL baseline verification passed:
  - YAML parse for `.github/workflows/codeql.yml` and `.github/codeql.yml`
  - `node --test tests/hardening.test.js --test-name-pattern="CodeQL scans"`
  - Hosted CodeQL push run `27002182993`: `CodeQL (javascript-typescript)` and
    `CodeQL (python)` both succeeded.
  - Hosted CodeQL pull-request run `27002184466`: both language jobs succeeded.
  - `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open --jq length`
    returned `0`.
  - `npm test`
  - `npm run check`
  - `npm run build`
- Cycle 8 companion release-channel verification passed for the code-side
  contract:
  - `python -m pytest astra_downloader/test_astra_downloader.py -q -k "CompanionUpdateEndpointTests or sha256"`
  - `node --test tests/hardening.test.js --test-name-pattern="release manifest generation"`
  - missing-EXE `node scripts/generate-release-manifest.js --require-companion`
    failed as expected
  - temporary MZ-header EXE staging plus `npm run release:manifest --
    --require-companion` generated matching companion sidecar/manifest/checksum
    entries
  - `python astra_downloader/build.py` produced a real 44.7 MB
    `AstraDownloader.exe`; staging it and rerunning the companion-required
    manifest check produced matching entries
  - `gh release view v4.46.0 --json tagName,targetCommitish,publishedAt,assets,url`
    confirmed the live release still lacks `AstraDownloader.exe` and
    `AstraDownloader.exe.sha256`; public release upload/dry-run was not
    performed by this automation pass
- Cycle 9 CODEOWNERS source-policy verification passed:
  - `gh repo view SysAdminDoc/Astra-Deck --json nameWithOwner,isPrivate,owner,viewerPermission,defaultBranchRef`
  - `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews --jq .`
  - `node --test tests/hardening.test.js --test-name-pattern="CODEOWNERS protects"`
  - `gh api "repos/SysAdminDoc/Astra-Deck/codeowners/errors?ref=codex/research-feature-plan-2026-06-05" --jq .`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - default-branch CODEOWNERS errors API validation remains pending until the
    file lands on `main`
- Cycle 10 runtime optional host-permissions verification passed:
  - `node sync-userscript.js`
  - generated store-safe manifest probe confirmed required
    `host_permissions` are limited to YouTube plus `sponsor.ajay.app`, default-off
    thumbnail/Return YouTube Dislike/Reddit hosts are emitted under
    `optional_host_permissions`, and the store-safe CSP still permits those
    runtime-granted connect origins
  - `rg -n "optional_host_permissions|permissions.request|permissions.contains|onRemoved|host_permissions|runtime-optional|optional-host" extension build-extension.js scripts tests docs ROADMAP.md RESEARCH_REPORT.md CHANGELOG.md COMPLETED.md AUTONOMOUS-LOOP-STATE.md`
  - `node --test tests/hardening.test.js --test-name-pattern="optional host|build-extension emits|data-flow|Return YouTube Dislike"`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - Manual unpacked Chrome/Firefox permission-prompt and revoke smoke was not
    run in this automation pass; denied/revoked UX remains in the follow-up
    roadmap scope.
- Cycle 11 background optional-host fetch enforcement verification passed:
  - `node --test tests/background.test.js`
  - `node --test tests/hardening.test.js --test-name-pattern="EXT_FETCH|optional host|build-extension emits|data-flow|Return YouTube Dislike"`
  - `npm run lint -- extension/background.js`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - Manual unpacked Chrome/Firefox permission-prompt and revoke smoke was not
    run in this automation pass; settings/data-flow denied/revoked state
    surfaces remain in the follow-up roadmap scope.
- Cycle 12 optional-host grant-state popup verification passed:
  - `node --check extension/popup.js`
  - `node --test tests/hardening.test.js --test-name-pattern="popup.js requests declared optional hosts|optional host"`
  - `npm run lint -- extension/popup.js extension/core/optional-host-permissions.js`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - Manual unpacked Chrome/Firefox permission-prompt and revoke smoke was not
    run in this automation pass.
- Cycle 13 SponsorBlock/DeArrow optional-host verification passed:
  - `node sync-userscript.js`
  - `node --check extension/popup.js`
  - `node --test tests/background.test.js`
  - `node --test tests/hardening.test.js --test-name-pattern="optional host|build-extension emits|data-flow generated|SponsorBlock and DeArrow"`
  - `npm run lint -- extension/popup.js extension/core/data-flow.js extension/core/optional-host-permissions.js`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - Manual unpacked Chrome/Firefox permission-prompt, grant, denial, revocation,
    and default-on SponsorBlock Grant access banner smoke was not run in this
    automation pass.
- Cycle 14 GitHub Actions SHA-pinning verification passed:
  - `rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)" .github/workflows`
    returned no mutable tag or branch action refs.
  - `rg -n "uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v" .github/workflows`
    listed all 20 workflow action refs.
  - `node --test tests/hardening.test.js --test-name-pattern="GitHub workflows pin|CodeQL scans|release manifest generation|validate workflow audits"`
  - `npm test` from the mapped `W:\repos\Astra-Deck` path; a prior UNC-path
    invocation ran zero tests because `cmd.exe` does not support UNC working
    directories and was not counted as verification.
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - Repository Actions permissions were not changed in this source-side cycle;
    `allowed_actions: selected` and `sha_pinning_required: true` remain pending
    until the SHA-clean branch lands and hosted workflows pass.
- Cycle 25 companion setup documentation verification passed:
  - `gh release view --repo SysAdminDoc/Astra-Deck --json tagName,publishedAt,assets,url --jq '{tagName,publishedAt,url,companionAssets: [.assets[].name | select(. == "AstraDownloader.exe" or . == "AstraDownloader.exe.sha256")], assetCount: (.assets | length)}'`
    confirmed latest release `v4.46.0` currently has no companion EXE or
    sidecar assets.
  - `rg -n "Astra Downloader|AstraDownloader.exe|Deno|PO Token" README.md docs/signing-keys.md docs`
  - `node --test tests/hardening.test.js --test-name-pattern="companion setup|release manifest generation"`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
  - No runtime/source/build/manifest changes were made beyond documentation and
    the README hardening regression; no companion EXE was uploaded in this
    automation pass.
- CodeQL PR-alert cleanup verification passed:
  - `gh api repos/SysAdminDoc/Astra-Deck/commits/1907e09e3fd61bf47bb8f559237d0606f55af647/check-runs`
    showed the separate CodeQL PR alert gate failing on six high-severity alerts
    after both CodeQL workflow jobs passed.
  - `gh api 'repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open&pr=26&tool_name=CodeQL&per_page=100'`
    mapped the alerts to `js/incomplete-url-substring-sanitization` in
    `tests/hardening.test.js` and `js/file-system-race` in
    `scripts/stage-companion-release.js`.
  - `node --check scripts/stage-companion-release.js`
  - `node --test tests/hardening.test.js --test-name-pattern="release manifest generation|CSP scopes|build-extension emits|runtime optional host|Cobalt fallback origin"`
  - `rg -n "\.includes\('https?://|\.includes\(\"https?://" tests/hardening.test.js`
    returned no string-URL substring assertions.
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Cycle 23 repo working-notes reconciliation verification passed:
  - `Test-Path -LiteralPath CODEX-CHANGELOG.md` returned `False`, confirming the
    old pointer would remain broken if kept.
  - `git check-ignore -v -- CLAUDE.md` confirmed `CLAUDE.md` is intentionally
    ignored, so the durable fix belongs in tracked `AGENTS.md`.
  - `rg -n 'CLAUDE.md.*source of truth|CODEX-CHANGELOG|strict_min_version: "128\.0"|Firefox 128|Firefox 128\+|push main|gh release create|All 5 artifacts|all 5 artifacts|Five-artifact|five-artifact' AGENTS.md`
    returned no stale tracked first-read matches.
  - `rg -n 'AUTONOMOUS-LOOP-STATE|ROADMAP.md|RESEARCH_REPORT.md|docs/signing-keys.md|docs/audit|optional local context' AGENTS.md`
    found the current tracked loop, planning, release, audit, and local-scratch
    guidance.
  - `node scripts/check-versions.js`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`
- Rendered popup audit note: the in-app Browser refused direct `file://` access
  to `extension/popup.html` under its URL policy, so no browser screenshot QA
  was claimed for this cycle. The popup accessibility and contrast gates passed
  through `npm run check`.
- Cycle 26 in-page overlay accessibility verification passed:
  - `node scripts/audit-overlays-a11y.js --self-test`
  - `node --test tests/hardening.test.js --test-name-pattern="audit:overlays|overlay|WCAG"`
  - `npm test`
  - `npm run check`
  - `npm run build`
  - `git diff --check`

## Next Cycle

- Continue this same assigned project in the next autonomous-loop cycle.
- Start with the next open high-priority roadmap item that is locally
  implementable without exposing secrets. As of Cycle 41, the remaining
  companion release-channel step is maintainer upload/live dry-run of the public
  EXE and sidecar, CODEOWNERS still needs default-branch validation plus `main`
  branch-protection enforcement after merge, repository selected-actions /
  required-SHA enforcement remains hosted settings work after merge, and the
  dependency-review workflow remains blocked until the repository dependency
  graph is enabled. Optional-permissions code is in place; Chromium pre-grant
  prompt readiness plus headed accept/deny/revoke state modes are scripted with
  Edge fallback, and Firefox now has a headed manual optional-host prompt
  harness. Those headed Chromium/Firefox modes still need a release-operator
  run before treating the store-safe permission UX as release-smoked.
  `npm run policy:actions` now generates the selected-actions policy payload
  before hosted mutation, and `DEPENDENCY_REVIEW_REQUIRED=true` is now the
  explicit switch for enforcing Dependency review after dependency graph proof.
  Capture-week
  remainder is now history, Watch Later, and open notifications; those require
  authenticated or clicked menu-state browser evidence before selector packs can
  be promoted. Cycle 34 delivered the hosted policy closure runbook, Cycle 35
  refined the authenticated selector lane into
  `docs/research-cycle-35-authenticated-capture-implementation-plan.md`, Cycle
  36 delivered the helper CLI/safety slice, Cycle 37 delivered the Chromium
  optional-host prompt-state smoke slice, Cycle 38 delivered the Firefox headed
  prompt harness, Cycle 39 delivered the Actions policy payload generator, and
  Cycle 40 delivered the Dependency review advisory gate, and Cycle 41 delivered
  the release-readiness report gate. Start Cycle 42 with positive
  authenticated captures only if a maintainer-local external Chrome profile is
  available and populated; otherwise continue local-first roadmap work such as
  roadmap cleanup for already-delivered source-side policy items, release
  digest comparison helpers, or other source-side proof that does not claim
  hosted/operator evidence.
  Do not add fixture-builder
  registrations, selector-pack provenance, hosted setting changes, companion
  release uploads, or release-operator claims without the required external
  evidence. Commit and push completed repository work when the branch remote
  allows it.
