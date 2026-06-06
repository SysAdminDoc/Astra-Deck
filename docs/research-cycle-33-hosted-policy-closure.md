# Research Cycle 33 - Hosted Policy Closure

Date: 2026-06-06

## Research Area

Post-merge closure order for hosted/manual security controls that cannot be
completed purely from source changes.

## Local Files Reviewed

- `docs/repo-settings.md`
- `ROADMAP.md`
- `AUTONOMOUS-LOOP-STATE.md`
- `.github/workflows/validate.yml`
- `.github/workflows/build.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/yt-dlp-smoke.yml`

## Findings

- The source tree already records separate open items for dependency graph /
  Dependency review, CODEOWNERS enforcement, Actions selected-actions /
  SHA-pinning, companion release assets, and manual optional-host prompt smoke.
- `docs/repo-settings.md` has the right policy targets, but future autonomous
  runs need a single closure order so they do not mutate hosted settings before
  the branch lands and hosted workflows prove the source-side pins.
- A live refresh was attempted with `gh api` for Actions permissions,
  repository security analysis, branch review policy, and release assets. Each
  command timed out after 34 seconds in this environment, so this cycle did not
  verify the current hosted state.

## External Sources

- GitHub dependency review:
  `https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review`
  - Dependency review becomes available when dependency graph is enabled.
- GitHub CODEOWNERS:
  `https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners`
  - CODEOWNERS can be paired with branch protection's "Require review from Code
    Owners"; a valid owner must have enough repository access.
- GitHub Actions permissions REST API:
  `https://docs.github.com/en/rest/actions/permissions`
  - Repository/organization Actions permissions support selected action sources
    and SHA-pinning policy.
- GitHub Actions secure use:
  `https://docs.github.com/en/actions/reference/security/secure-use`
  - Full-length commit SHA pinning is the immutable-action option; same-line
    comments preserve Dependabot update context for GitHub Actions refs.

## Roadmap Change

Added a P1 item to `ROADMAP.md` for a post-merge hosted policy closure runbook.
The runbook should sequence:

1. Read-only hosted-state refresh.
2. Dependency graph / Dependabot alert enablement and Dependency review rerun.
3. Default-branch CODEOWNERS validation and code-owner review enforcement.
4. Selected Actions plus full-length SHA-pinning policy after hosted workflow
   proof.
5. Final hosted check reruns and `docs/repo-settings.md` evidence updates.

## Next Leads

- Retry the read-only `gh api` checks when GitHub CLI/network access is
  responsive.
- Create the runbook in `docs/` before any hosted settings mutation.
- Keep companion release upload and repository setting mutation maintainer-gated
  unless the current thread explicitly asks for those actions.
