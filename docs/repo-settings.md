# Astra Deck Repository Settings

Last updated: 2026-06-06

This file records repository settings that are intentionally managed outside the
source tree.

See [hosted-policy-closure.md](hosted-policy-closure.md) for the post-merge
closure order before changing dependency graph, CODEOWNERS, selected Actions,
SHA-pinning, or companion release-asset state.

## `main` Branch Protection

`main` uses classic branch protection. Required status checks are enabled with
strict branch updates so a protected update must be based on the latest `main`
and have the latest successful `Validate` checks.

Required check contexts:

- `JS tests + check gate`
- `Python dependency audit`
- `Python downloader tests`

Keep these names synchronized with `.github/workflows/validate.yml` job names.
If a job is renamed, update branch protection in the same change window.

Current non-required context:

- `Dependency review`

`Dependency review` is skipped on direct pushes because it only runs for pull
requests. Add it to required checks after a throwaway PR confirms the exact
required-check behavior for PR-only dependency-review runs.

Current policy:

- Keep admin enforcement enabled.
- Keep force pushes disabled.
- Keep branch deletion disabled.
- Keep required conversation resolution enabled.
- Keep repository rulesets empty unless replacing this classic branch-protection
  rule with an equivalent active ruleset.

## GitHub Actions Permissions

Current repository snapshot from 2026-06-04:

- Actions enabled: yes.
- Allowed actions policy: `all`.
- Full-length SHA pinning required: no.
- Default `GITHUB_TOKEN` workflow permissions: read.
- Workflow-created PR approvals: disabled.

Read-only refresh from 2026-06-06:

- Actions enabled: yes.
- Allowed actions policy: `all`.
- Full-length SHA pinning required: no.
- Selected-actions URL: none.
- Default `GITHUB_TOKEN` workflow permissions: read.
- Workflow-created PR approvals: disabled.

Source-tree status from 2026-06-05:

- `.github/workflows/validate.yml`, `.github/workflows/build.yml`,
  `.github/workflows/yt-dlp-smoke.yml`, and `.github/workflows/codeql.yml`
  reference external actions by full 40-character commit SHA with same-line
  version comments.
- `actions/dependency-review-action` is pinned to the upstream `v5.0.0` release
  commit because no upstream `v5` tag exists.
- `tests/hardening.test.js` rejects mutable tag/branch action refs and pins the
  resolved action commits.

Target hosted policy after the SHA-clean workflow branch lands and hosted
workflow runs pass:

- Change allowed actions to `selected`.
- Allow GitHub-owned actions.
- Keep broad verified-creator allowance disabled.
- Add explicit `patterns_allowed` entries only for deliberate non-GitHub-owned
  actions or reusable workflows. Current deliberate non-GitHub-owned action:
  `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`
  (`# v1.7.2`).
- Require full-length SHA pinning for actions.

Do not enable the hosted SHA-pinning policy until this branch has landed on the
default branch and a fresh hosted `Validate`, `Build & Release` dry-run or tag
run, `yt-dlp Smoke`, and `CodeQL` run have proved the pinned refs execute under
the repository's selected-actions policy.

## Private Vulnerability Reporting

Current snapshot from 2026-06-05:

- Private vulnerability reporting: enabled.
- Repository security advisory count: 0.
- Public issues: enabled.
- Root `SECURITY.md`: present and linked from README / CONTRIBUTING.

Policy:

- Keep root `SECURITY.md` current with supported versions, response windows,
  sensitive-report handling, and high-priority vulnerability classes.
- Keep private vulnerability reporting enabled for the public repository.
- Keep public bug-report templates for non-sensitive bugs only.
- Maintainers responsible for security triage should watch the repository for
  security alerts or all activity so private vulnerability reports are not
  missed.

## Code Scanning

Current snapshot from 2026-06-05:

- GitHub code-scanning default setup: `not-configured`.
- Detected languages from the default-setup API: `actions`, `javascript`,
  `javascript-typescript`, `python`, `typescript`.
- Advanced setup workflow: `.github/workflows/codeql.yml`.
- CodeQL config: `.github/codeql.yml`.
- Scanned languages: `javascript-typescript` and `python`.
- Query suite: `security-extended`.
- Code-scanning alerts API: `0` open alerts after the first hosted baseline.
- Hosted baseline:
  - Push run `27002182993`: `CodeQL (javascript-typescript)` and
    `CodeQL (python)` both succeeded on branch
    `codex/research-feature-plan-2026-06-05`.
  - Pull-request run `27002184466`: both language jobs also succeeded on the
    same head SHA.
- Default setup remains `not-configured` because this repository now uses
  advanced setup.

Policy:

- Keep advanced CodeQL setup enabled for `javascript-typescript` and `python`.
- Keep `security-extended` for the first baseline; document any move to
  `security-and-quality` after runtime and false-positive volume are known.
- Keep generated outputs, `node_modules`, `build`, `mhtml`, and archived
  research/release artifacts out of the scan target.
- Leave CodeQL advisory-only for now. Add exact CodeQL check contexts to branch
  protection only after the workflow has also succeeded on `main` or after the
  next PR confirms the required-check names in the protected-branch UI.
- Treat future CodeQL findings like security bugs: fix true positives, document
  dismissals with a reason, and avoid blanket suppressions.

## Secret Scanning

Current snapshot from 2026-06-05:

- Secret scanning: enabled.
- Secret scanning push protection: enabled.
- Open secret-scanning alerts: 0.
- Alert 1 (`google_api_key`): resolved as `false_positive` on 2026-06-05 after
  triage confirmed the matched value was a public YouTube/Innertube bootstrap
  fallback, not a private provider credential. The value was not printed in
  chat, docs, or commits.
- Active source and tracked archive snapshots no longer contain Google
  API-key-shaped literals; `extension/core/transcript-service.js` now requires
  a page-derived Innertube API key and falls through to the existing HTML /
  caption / DOM transcript methods when one is unavailable.
- Secret scanning validity checks: disabled.
- Secret scanning non-provider patterns: disabled.

Read-only refresh from 2026-06-06:

- Repository is public.
- Secret scanning: enabled.
- Secret scanning push protection: enabled.
- Dependabot security updates: disabled.
- Secret scanning validity checks: disabled.
- Secret scanning non-provider patterns: disabled.
- Dependency graph status is not exposed in the returned
  `security_and_analysis` block.

Attempted setting changes:

- 2026-06-05: form-encoded and JSON `PATCH /repos/SysAdminDoc/Astra-Deck`
  requests attempted to set `secret_scanning_validity_checks` and
  `secret_scanning_non_provider_patterns` to `enabled`. The endpoint returned
  successfully, but the repository `security_and_analysis` response still
  reported both settings as `disabled`. Treat these as unavailable/no-op through
  the repository endpoint until a GitHub UI or account-level code-security
  configuration exposes them.

Target policy:

- Keep secret scanning and push protection enabled.
- Do not commit provider-key-shaped literals. Parse public YouTube/Innertube
  client keys from page scripts at runtime instead.
- Re-check validity checks and non-provider patterns when repository security
  settings are revisited.

## Code Owners

Current snapshot from 2026-06-05:

- `.github/CODEOWNERS`: present on the feature branch; pending merge to `main`.
- Root `CODEOWNERS`: absent.
- `docs/CODEOWNERS`: absent.
- Repository owner: `@SysAdminDoc`.
- Current viewer permission from `gh repo view`: `ADMIN`.
- Required approving reviews on `main`: 1.
- Require code-owner reviews on `main`: disabled.
- CODEOWNERS errors endpoint on feature branch
  `codex/research-feature-plan-2026-06-05`: `errors: []`.
- CODEOWNERS errors endpoint on default branch: `404 Not Found` until the file
  lands on `main`.

Read-only refresh from 2026-06-06:

- Required approving reviews on `main`: 1.
- Require code-owner reviews on `main`: disabled.
- Default-branch CODEOWNERS errors endpoint still returns `404 Not Found`.

Target policy:

- Keep `.github/CODEOWNERS` covering security-sensitive workflow, release,
  signing, security-policy, extension-permission, background-proxy, data-flow,
  trusted-DOM, and companion-loopback paths.
- Use only users or teams with write access.
- Re-check `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq
  ".errors"` after the CODEOWNERS file lands on `main`.
- Enable `require_code_owner_reviews` after CODEOWNERS exists on `main`.
