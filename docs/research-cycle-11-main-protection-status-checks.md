# Project Research and Feature Plan - Cycle 11 Main Protection Status Checks

Date: 2026-06-04

## Executive Summary

Astra Deck's validation workflow is now stronger: Python Qt collection is fixed,
privacy docs are in place, and the Python dependency audit gate has been added.
The repository settings have not caught up. Live GitHub API checks show `main`
has some branch protection, but required status checks are not enabled and there
are no repository rulesets. That leaves a gap between the roadmap's expected
"green gates before release" discipline and what GitHub actually enforces before
`main` changes.

Recommended next item:

1. P1 - Require green `Validate` checks before `main` updates.
2. P1 - Document the exact required check context names so future workflow
   renames update branch protection at the same time.
3. P2 - Add a low-friction throwaway-PR verification after enabling the rule.

## Evidence Reviewed

Local/current sources inspected:

- `gh run list --workflow Validate --limit 8`
- `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection`
- `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks`
- `gh api repos/SysAdminDoc/Astra-Deck/rulesets`
- `.github/workflows/validate.yml`
- `ROADMAP.md`
- `RESEARCH_REPORT.md`

API findings:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection
```

Observed:

- Branch protection exists.
- `enforce_admins.enabled` is `true`.
- `required_conversation_resolution.enabled` is `true`.
- `allow_force_pushes.enabled` is `false`.
- `allow_deletions.enabled` is `false`.
- The response did not include configured required status checks.

```powershell
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks
```

Observed:

- HTTP 404.
- Message: `Required status checks not enabled`.

```powershell
gh api repos/SysAdminDoc/Astra-Deck/rulesets
```

Observed:

- `[]`
- No repository ruleset is currently available as an alternative enforcement
  path.

Recent `Validate` run evidence:

- Current successful `main` runs:
  - `26950889307` - `ci: audit python companion dependencies` - success.
  - `26950502914` - `docs: add privacy consent packet` - success.
  - `26950005859` - `ci: restore downloader validation on ubuntu` - success.
- Earlier failed `main` runs still landed:
  - `26949503878` - `docs(roadmap): add privacy consent readiness` - failure.
  - `26948767185` - `docs(roadmap): add ci and release integrity queue` -
    failure.
  - `26946855242` - `test: pin companion update SHA-256 verification` -
    failure.

External sources reviewed:

- GitHub protected branches overview:
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub branch-protection REST API:
  https://docs.github.com/en/rest/branches/branch-protection?apiVersion=2022-11-28
- GitHub rulesets overview:
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

## Current Gap

Current settings enforce some important behavior:

- Administrators are covered by branch protection.
- Force pushes are disabled.
- Branch deletion is disabled.
- Conversation resolution is required.

Missing enforcement:

- Required status checks are not enabled.
- No repository ruleset currently targets `main`.
- The validation workflow can fail after a push to `main` without GitHub
  blocking that update.

This matters more now that `Validate` carries release-critical checks:

- JavaScript tests + `npm run check`.
- JavaScript dependency audit through `npm audit`.
- Python dependency audit through `pip-audit`.
- Python downloader tests with Qt runtime preflight.
- PR dependency review.

## Recommended Roadmap Item

Add one P1 manual-gated item:

**Require green validation checks before `main` updates.**

Acceptance shape:

- Use either branch protection required status checks or an active repository
  ruleset targeting `main`.
- Require the latest successful `Validate` contexts before merge/update.
- Minimum required checks:
  - `Validate / JS tests + check gate`
  - `Validate / Python dependency audit`
  - `Validate / Python downloader tests`
  - `Validate / Dependency review` for pull requests once the context exists.
- Require branches to be up to date before merge if the maintainer wants strict
  protection.
- Keep force pushes and deletions disabled.
- Keep admin enforcement enabled unless the maintainer records a deliberate
  bypass policy.
- Document the configured context names so future workflow renames update the
  GitHub setting in the same change.

## Implementation Notes

UI path:

1. Repository Settings.
2. Branches or Rulesets.
3. Edit the `main` branch protection rule, or create an active branch ruleset
   targeting `main`.
4. Enable required status checks.
5. Select the current `Validate` job contexts.
6. Save, then verify with the API commands below.

API verification:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks
```

Expected after branch-protection path:

- HTTP 200.
- `strict` is the selected up-to-date-branch setting.
- `contexts` or `checks` include the required `Validate` jobs.

Ruleset verification:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/rulesets
```

Expected after ruleset path:

- At least one active ruleset targets `main`.
- The rules include required status checks matching `Validate` contexts.

## Verification Ideas

- Open a throwaway PR with a harmless fixture or docs change and confirm it
  cannot merge until required checks are successful.
- Temporarily disable or break one check on a throwaway branch and confirm the
  merge button is blocked.
- Confirm direct pushes are still limited according to the maintainer's intended
  bypass policy.
- Confirm `gh api .../required_status_checks` or `gh api .../rulesets` reflects
  the saved configuration.

## Explicit Non-Goals

- No source-code changes are required to enable the setting.
- No change to the validation workflow itself is required by this research pass.
- No force-push, reset, or branch rewrite.
- No requirement to add pull-request reviews if the maintainer wants a
  solo-maintainer direct-push flow; this item is specifically about required
  green checks.

## Open Questions

- Should the repository use classic branch protection or a repository ruleset
  for `main`?
- Should branch protection require branches to be up to date before merging?
- Should direct pushes by the maintainer remain allowed if checks still run
  post-push, or should all `main` updates go through PRs?
- Should the release workflow checks also become required once release-catch-up
  work lands?
