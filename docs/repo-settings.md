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
