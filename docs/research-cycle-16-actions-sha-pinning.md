# Project Research and Feature Plan - Cycle 16 Actions SHA Pinning

Date: 2026-06-04

## Executive Summary

Astra Deck's workflows are well-scoped on `GITHUB_TOKEN` defaults, but the
repository still allows every public GitHub Action and the workflows reference
external actions by mutable tags such as `actions/checkout@v4`. GitHub's
current security guidance treats full-length commit SHAs as the immutable action
reference and exposes a repository policy that can require SHA pinning. This is
a distinct follow-up after the Cycle 13 Node 24 action-major migration: first
move to the supported action majors, then pin those resolved tags to full SHAs
and turn on the repository policy.

Recommended next item:

1. P2 - Pin GitHub Actions to full-length SHAs and restrict allowed action
   sources.

Implementation update 2026-06-05:

- Source-side workflow SHA pinning is now complete on the feature branch.
- `validate.yml`, `build.yml`, `yt-dlp-smoke.yml`, and `codeql.yml` now pin all
  20 external workflow `uses:` refs to full 40-character commits with same-line
  version comments.
- `actions/dependency-review-action` is pinned to `v5.0.0` because no upstream
  `v5` tag exists.
- The remaining work is hosted repository policy: change Actions permissions to
  `allowed_actions: selected`, keep broad verified creators disabled, allow
  GitHub-owned actions, and enable `sha_pinning_required` after the branch lands
  and hosted workflow runs pass.
- Detailed implementation notes live in
  `docs/audit/2026-06-05-actions-sha-pinning.md`.

## Evidence Reviewed

Local/current commands inspected:

- `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq "{enabled,allowed_actions,sha_pinning_required,selected_actions_url}"`
- `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/workflow --jq .`
- `rg -n "uses:\s*[^#]+@" .github/workflows`
- `Get-Content .github/dependabot.yml`
- `Get-Content .github/workflows/validate.yml`
- `Get-Content .github/workflows/build.yml`
- `Get-Content .github/workflows/yt-dlp-smoke.yml`
- `rg -n "sha_pinning|required.*SHA|pin.*SHA|allowed_actions|allowed actions|Actions permissions|action.*pin" ROADMAP.md RESEARCH_REPORT.md docs`

Live repository Actions permissions:

```json
{
  "enabled": true,
  "allowed_actions": "all",
  "selected_actions_url": null,
  "sha_pinning_required": false
}
```

Workflow token defaults:

```json
{
  "can_approve_pull_request_reviews": false,
  "default_workflow_permissions": "read"
}
```

Current external workflow action refs:

- `.github/workflows/build.yml`: `actions/checkout@v4`
- `.github/workflows/build.yml`: `actions/setup-node@v4`
- `.github/workflows/build.yml`: `actions/upload-artifact@v4`
- `.github/workflows/build.yml`: `actions/attest-build-provenance@v4`
- `.github/workflows/build.yml`: `actions/attest-sbom@v4`
- `.github/workflows/validate.yml`: `actions/checkout@v4`
- `.github/workflows/validate.yml`: `actions/dependency-review-action@v5`
- `.github/workflows/validate.yml`: `actions/checkout@v4`
- `.github/workflows/validate.yml`: `actions/setup-node@v4`
- `.github/workflows/validate.yml`: `actions/upload-artifact@v4`
- `.github/workflows/validate.yml`: `actions/checkout@v4`
- `.github/workflows/validate.yml`: `actions/setup-python@v5`
- `.github/workflows/validate.yml`: `actions/upload-artifact@v4`
- `.github/workflows/validate.yml`: `actions/checkout@v4`
- `.github/workflows/validate.yml`: `actions/setup-python@v5`
- `.github/workflows/yt-dlp-smoke.yml`: `actions/checkout@v4`
- `.github/workflows/yt-dlp-smoke.yml`: `actions/setup-python@v5`

External sources reviewed:

- GitHub Docs - Secure use reference:
  https://docs.github.com/en/actions/reference/security/secure-use
- GitHub Docs - Managing GitHub Actions settings for a repository:
  https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- GitHub Docs - REST API endpoints for GitHub Actions permissions:
  https://docs.github.com/en/rest/actions/permissions?apiVersion=2026-03-10
- GitHub Docs - Keeping your actions up to date with Dependabot:
  https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/keeping-your-actions-up-to-date-with-dependabot
- GitHub Docs - Dependabot supported ecosystems and repositories:
  https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories

Relevant source facts:

- GitHub says pinning an action to a full-length commit SHA is the immutable
  action-reference option.
- GitHub repository settings can require actions to be pinned to full-length
  commit SHAs.
- Repository Actions permissions can move from `allowed_actions: all` to
  `allowed_actions: selected`, then define whether GitHub-owned actions,
  verified Marketplace creators, or explicit patterns are allowed.
- Dependabot's `github-actions` ecosystem can keep workflow action references
  updated, and its supported-ecosystems docs describe same-line version comments
  for action references.

## Current Gap

The good current state:

- `.github/dependabot.yml` already has a `github-actions` ecosystem entry.
- Repository workflow defaults already keep `GITHUB_TOKEN` read-only and do not
  let workflows create or approve PR reviews.
- Workflows have explicit per-workflow or per-job permissions, including the
  release workflow's required `contents`, `id-token`, and `attestations`
  grants.

The remaining gap at the time of the 2026-06-04 research pass:

- The repository policy still allows every action source.
- `sha_pinning_required` is disabled.
- Workflow `uses:` entries are tag-pinned rather than full-SHA pinned.
- The release workflow is the highest-value place to close this because it has
  write and attestation permissions on tag builds.

After the 2026-06-05 implementation pass, only the hosted repository policy
portion remains: workflow `uses:` entries are full-SHA pinned, while
`allowed_actions: selected` and `sha_pinning_required: true` still need to be
applied after the branch lands and hosted workflows pass.

## Recommended Roadmap Item

Add one P2 manual-gated item:

**Pin GitHub Actions to full-length SHAs and restrict allowed action sources.**

Acceptance shape:

- Complete the Cycle 13 Node 24 action-major migration first, or do the major
  migration before resolving tags to SHAs in the same implementation branch.
- Resolve every external action tag to the full 40-character commit SHA in the
  upstream action repository.
- Keep a same-line version comment next to each pinned SHA so Dependabot has a
  readable tag/update anchor.
- Run `Validate`, `Build & Release`, and `yt-dlp Smoke` after pinning.
- Change repository Actions permissions to `allowed_actions: selected`.
- Allow GitHub-owned actions, keep broad verified-creator allowance disabled,
  and add explicit `patterns_allowed` entries only when a non-GitHub-owned
  action is deliberately introduced.
- Enable `sha_pinning_required` after workflows are already SHA-clean.
- Update `docs/repo-settings.md` with the final policy state.

## Implementation Notes

Suggested implementation order:

1. Land or combine the Node 24 action-major migration.
2. Resolve each action tag to the full commit SHA from the action owner's repo.
3. Replace workflow refs with `OWNER/REPO@<40-char-sha> # <tag>` style entries.
4. Keep `.github/dependabot.yml` monitoring `github-actions` updates.
5. Run the three workflow families.
6. Set repository Actions permissions to selected and require SHA pinning.
7. Record the settings snapshot in `docs/repo-settings.md`.

## Verification Ideas

Mutable-ref scan:

```powershell
rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)" .github/workflows
```

Expected:

- No mutable major-branch external action refs.

Pinned ref inventory:

```powershell
rg -n "uses:\s*[^#]+@[0-9a-f]{40}(\s|$)" .github/workflows
```

Expected:

- Every external `uses:` entry is listed with a full SHA.

Repository policy:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq "{allowed_actions,sha_pinning_required}"
gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/selected-actions --jq .
```

Expected:

- `allowed_actions` is `selected`.
- `sha_pinning_required` is `true`.
- GitHub-owned actions are allowed.
- Broad verified-creator allowance is disabled.
- Additional patterns are empty or deliberately documented.

## Explicit Non-Goals

- Do not pin stale Node 20-era action majors as the end state.
- Do not disable Dependabot Actions updates.
- Do not enable the SHA-pinning repository policy before workflows are
  SHA-clean.

## Open Questions

- Should the implementation wait for all Cycle 13 action-major PRs to merge, or
  combine Node 24 major migration and SHA pinning in one branch?
- Should Dependabot remain monthly for Actions after SHA pinning, or move to
  weekly while the Node 24 migration and SHA-policy rollout settle?
