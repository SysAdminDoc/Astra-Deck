# Dependency Review Advisory Gate - 2026-06-06

## Scope

- `.github/workflows/validate.yml`
- `tests/dependency-review-policy.test.js`
- `docs/hosted-policy-closure.md`
- `docs/repo-settings.md`
- `ROADMAP.md`

## Finding

The `Validate / Dependency review` job is PR-only and should become a real
branch-protection signal after GitHub dependency graph is enabled. Until that
hosted setting is fixed, the job can fail before reviewing any dependency diff
with repository setup text. That makes dependency-maintenance PRs noisy without
producing a concrete vulnerable-dependency finding.

## Fix

- Kept the `Dependency review` job PR-only.
- Added a repository-variable switch:
  `continue-on-error: ${{ vars.DEPENDENCY_REVIEW_REQUIRED != 'true' }}`.
- With the variable unset or any value other than `true`, the job remains
  advisory while dependency graph / Dependabot settings are still hosted-gated.
- After dependency graph is enabled and a PR run proves the check context, set
  `DEPENDENCY_REVIEW_REQUIRED=true` to make the job enforce its existing
  `fail-on-severity: moderate` policy.
- Added regression coverage for the PR-only condition, advisory switch, pinned
  `actions/dependency-review-action` ref, and moderate vulnerability floor.

## Verification

- `node --test tests/dependency-review-policy.test.js`
- `node --test tests/actions-policy.test.js`
- `npm run policy:actions`
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Remaining Work

- Enable dependency graph / Dependabot alerts where available in GitHub hosted
  settings.
- Rerun a dependency PR and confirm `Validate / Dependency review` no longer
  fails with repository setup text.
- Set `DEPENDENCY_REVIEW_REQUIRED=true` only after that proof, then record the
  hosted output in `docs/repo-settings.md`.
