# Astra Deck Repository Settings

Last updated: 2026-06-04

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
