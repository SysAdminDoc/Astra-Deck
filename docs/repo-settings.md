# Astra Deck Repository Settings

Last updated: 2026-06-05

This file records repository settings that are intentionally managed outside the
source tree.

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

Current snapshot from 2026-06-04:

- Actions enabled: yes.
- Allowed actions policy: `all`.
- Full-length SHA pinning required: no.
- Default `GITHUB_TOKEN` workflow permissions: read.
- Workflow-created PR approvals: disabled.

Target policy after workflow refs are SHA-clean:

- Change allowed actions to `selected`.
- Allow GitHub-owned actions.
- Keep broad verified-creator allowance disabled.
- Add explicit `patterns_allowed` entries only for deliberate non-GitHub-owned
  actions or reusable workflows.
- Require full-length SHA pinning for actions.

Do not enable the SHA-pinning policy before all external `uses:` entries are
pinned to full 40-character commit SHAs; otherwise existing validation and
release workflows can be blocked by repository policy before the workflow patch
lands.

## Private Vulnerability Reporting

Current snapshot from 2026-06-04:

- Private vulnerability reporting: disabled.
- Repository security advisory count: 0.
- Public issues: enabled.
- Root `SECURITY.md`: absent.

Target policy:

- Add root `SECURITY.md` with supported versions and private reporting
  instructions.
- Enable private vulnerability reporting for the public repository.
- Keep public bug-report templates for non-sensitive bugs only.
- Ensure maintainers receive notifications for private vulnerability reports.

## Code Scanning

Current snapshot from 2026-06-04:

- GitHub code-scanning default setup: `not-configured`.
- Detected languages from the default-setup API: `actions`, `javascript`,
  `javascript-typescript`, `python`, `typescript`.
- Code-scanning alerts API: `404 no analysis found`.
- CodeQL workflow file: absent.
- `security-events: write` workflow permission: absent.

Target policy:

- Add an advanced CodeQL workflow for `javascript` and `python`.
- Prefer `security-extended` for the first baseline; document any move to
  `security-and-quality` after runtime and false-positive volume are known.
- Keep generated outputs, `node_modules`, `build`, `mhtml`, and archived
  research/release artifacts out of the scan target.
- Record first-run findings and triage decisions before making CodeQL a
  required `main` check.
- After a clean or fully triaged baseline, add the exact CodeQL check context to
  branch protection or record why the gate remains advisory-only.

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

Current snapshot from 2026-06-04:

- `.github/CODEOWNERS`: absent.
- Root `CODEOWNERS`: absent.
- `docs/CODEOWNERS`: absent.
- Repository owner: `@SysAdminDoc`.
- Current viewer permission from `gh repo view`: `ADMIN`.
- Required approving reviews on `main`: 1.
- Require code-owner reviews on `main`: disabled.
- CODEOWNERS errors endpoint: `404 Not Found` while no CODEOWNERS file exists.

Target policy:

- Add `.github/CODEOWNERS` for security-sensitive workflow, release, signing,
  security-policy, extension-permission, background-proxy, data-flow,
  redaction, and companion-loopback paths.
- Use only users or teams with write access.
- Check `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq ".errors"`
  before enabling enforcement.
- Enable `require_code_owner_reviews` after CODEOWNERS exists on `main`.
