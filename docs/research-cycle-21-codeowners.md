# Project Research and Feature Plan - Cycle 21 CODEOWNERS

Date: 2026-06-04

## Executive Summary

The repository now has a substantial security and release-hardening queue, but
there is no CODEOWNERS file and `main` does not require code-owner review.
Required pull-request review exists, yet ownership is not path-aware. A small
CODEOWNERS policy would make changes to workflows, signing/release tooling,
security policy, extension permission/proxy code, and companion loopback code
request the right review automatically.

Recommended next item:

1. P2 - Add CODEOWNERS coverage for security-sensitive paths.

## Evidence Reviewed

Local/current commands inspected:

- `Test-Path .github/CODEOWNERS`
- `Test-Path CODEOWNERS`
- `Test-Path docs/CODEOWNERS`
- `rg -n "CODEOWNERS|code owner|code-owner|require_code_owner_reviews|required approving review|review policy|reviewer" .github docs ROADMAP.md RESEARCH_REPORT.md README.md CONTRIBUTING.md`
- `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews --jq .`
- `gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection --jq "{required_pull_request_reviews:.required_pull_request_reviews, restrictions:.restrictions, enforce_admins:.enforce_admins.enabled, required_conversation_resolution:.required_conversation_resolution.enabled}"`
- `gh repo view SysAdminDoc/Astra-Deck --json nameWithOwner,isPrivate,owner,viewerPermission`
- `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq .`
- `Get-Content .github/pull_request_template.md`

Observed repository state:

```json
{
  "github_codeowners_present": false,
  "root_codeowners_present": false,
  "docs_codeowners_present": false,
  "repository_owner": "SysAdminDoc",
  "viewer_permission": "ADMIN",
  "required_approving_review_count": 1,
  "require_code_owner_reviews": false,
  "dismiss_stale_reviews": false,
  "require_last_push_approval": false,
  "required_conversation_resolution": true,
  "admin_enforcement": true,
  "codeowners_errors_endpoint": "404 Not Found while no CODEOWNERS file exists"
}
```

Current review surface:

- `.github/pull_request_template.md` has generic Summary / Changes / Testing
  sections.
- It does not mention security-sensitive paths or required owner review.
- Branch protection has required conversation resolution and one approving
  review, but does not require code-owner approval.
- The repository is a personal public repository owned by `@SysAdminDoc`; no
  organization team was visible in the live repo metadata, so a future team
  reference would need to be created and granted write access before use.

Security-sensitive path candidates:

- `.github/workflows/`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- `SECURITY.md`
- `build-extension.js`
- `scripts/generate-release-manifest.js`
- `docs/signing-keys.md`
- `docs/repo-settings.md`
- `docs/privacy-policy.md`
- `extension/manifest.json`
- `extension/background.js`
- `extension/core/data-flow.js`
- `extension/core/policy-profile.js`
- `extension/core/trusted-html.js`
- `astra_downloader/`

External sources reviewed:

1. GitHub Docs - About code owners:
   https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
2. GitHub Docs - About protected branches:
   https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
3. GitHub Docs - Managing a branch protection rule:
   https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule
4. GitHub REST API - Protected branches:
   https://docs.github.com/en/rest/branches/branch-protection
5. GitHub REST API - List CODEOWNERS errors:
   https://docs.github.com/en/rest/repos/repos#list-codeowners-errors
6. GitHub Docs - About rulesets:
   https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
7. GitHub Docs - Creating rulesets for a repository:
   https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository
8. GitHub Docs - Managing rulesets for a repository:
   https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository
9. GitHub REST API - Repository rulesets:
   https://docs.github.com/en/rest/repos/rules
10. GitHub REST API - Organization rulesets:
    https://docs.github.com/en/rest/orgs/rules
11. GitHub Docs - Approving a pull request with required reviews:
    https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews
12. GitHub Docs - About pull request reviews:
    https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
13. GitHub Docs - Requesting a pull request review:
    https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/requesting-a-pull-request-review
14. GitHub Docs - Reviewing proposed changes in a pull request:
    https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request
15. GitHub Docs - About pull requests:
    https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests
16. GitHub Docs - Changing the stage of a pull request:
    https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/changing-the-stage-of-a-pull-request
17. GitHub Docs - Managing pull request reviews in a repository:
    https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-pull-request-reviews-in-your-repository
18. GitHub Docs - About issue and pull request templates:
    https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates
19. GitHub Docs - Creating a pull request template:
    https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository
20. GitHub Changelog - CODEOWNERS improvements:
    https://github.blog/changelog/2022-02-17-codeowners-improvements-syntax-errors-preview-of-who-will-be-requested-and-more/
21. OpenSSF - Source Code Management Platform Configuration Best Practices:
    https://best.openssf.org/SCM-BestPractices/
22. OpenSSF Scorecard - Checks overview:
    https://github.com/ossf/scorecard/blob/main/docs/checks.md
23. OpenSSF Scorecard - Code-Review check:
    https://github.com/ossf/scorecard/blob/main/docs/checks.md#code-review
24. OpenSSF Scorecard - Branch-Protection check:
    https://github.com/ossf/scorecard/blob/main/docs/checks.md#branch-protection
25. GitHub Docs - Security hardening for GitHub Actions:
    https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
26. GitHub Docs - Automatic token authentication:
    https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication
27. GitHub Docs - Managing GitHub Actions settings for a repository:
    https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
28. GitHub Docs - Managing teams and people with repository access:
    https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository
29. GitHub Docs - Inviting collaborators to a personal repository:
    https://docs.github.com/articles/inviting-collaborators-to-a-personal-repository
30. GitHub Docs - Repository roles for an organization:
    https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization
31. GitHub Docs - Managing security and analysis settings:
    https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository
32. GitHub Docs - About repository security advisories:
    https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories
33. GitHub Docs - Best practices for repositories:
    https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories
34. GitHub Docs - Repository limits:
    https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits

Relevant source facts:

- GitHub supports CODEOWNERS files in `.github/`, root, or `docs/`; if more
  than one exists, GitHub uses the first in that search order.
- Code owners must have write permission to the repository.
- CODEOWNERS review requests are based on the base branch file.
- Branch protection can optionally require code-owner approval before merge.
- When code-owner review is required, one approval from an owner for an affected
  file is sufficient for that ownership requirement.
- Invalid CODEOWNERS syntax or owners can be checked through the repository
  CODEOWNERS errors API.
- GitHub recommends protecting the CODEOWNERS file itself; keeping it in
  `.github/` and owning `.github/` or `.github/CODEOWNERS` is the stronger
  default for this repository because workflows and release settings already
  live there.
- OpenSSF SCM guidance and Scorecard both treat protected default branches and
  code review as repository-security posture indicators; CODEOWNERS is the
  path-aware review layer missing from Astra Deck's current one-review rule.

## Current Gap

Good current state:

- `main` has required status checks.
- `main` requires conversation resolution.
- Pull requests need at least one approving review according to the current
  required-review API response.

Remaining gap:

- There is no CODEOWNERS file.
- Branch protection does not require code-owner reviews.
- Security-sensitive changes do not automatically request the maintainer/team
  most responsible for workflows, releases, signing, security policy, extension
  host permissions, background proxying, or companion loopback code.

## Recommended Roadmap Item

Add one P2 manual-gated item:

**Add CODEOWNERS coverage for security-sensitive paths.**

Acceptance shape:

- Add `.github/CODEOWNERS`.
- Use only users or teams with write access, likely `@SysAdminDoc` unless a
  real organization team exists.
- Cover high-risk workflow, release, signing, policy, extension-permission,
  background-proxy, data-flow, redaction, and companion-loopback paths.
- Avoid blanket ownership over generated artifacts and archived research unless
  those files control release/security policy.
- Run the CODEOWNERS errors API on the branch before enabling enforcement.
- Enable `require_code_owner_reviews` in branch protection after the file is on
  `main`.
- Record the final review policy in `docs/repo-settings.md`.

## Implementation Notes

Suggested CODEOWNERS shape:

```text
# Security and release ownership.
.github/workflows/ @SysAdminDoc
.github/dependabot.yml @SysAdminDoc
.github/CODEOWNERS @SysAdminDoc
SECURITY.md @SysAdminDoc
build-extension.js @SysAdminDoc
scripts/generate-release-manifest.js @SysAdminDoc
docs/signing-keys.md @SysAdminDoc
docs/repo-settings.md @SysAdminDoc
docs/privacy-policy.md @SysAdminDoc
extension/manifest.json @SysAdminDoc
extension/background.js @SysAdminDoc
extension/core/data-flow.js @SysAdminDoc
extension/core/policy-profile.js @SysAdminDoc
extension/core/trusted-html.js @SysAdminDoc
astra_downloader/ @SysAdminDoc
```

Implementation order:

1. Confirm whether a write-enabled organization team should own these paths or
   whether `@SysAdminDoc` is the only valid owner.
2. Add `.github/CODEOWNERS`.
3. Open a PR touching one owned path and confirm review is requested.
4. Enable `require_code_owner_reviews`.
5. Update `docs/repo-settings.md`.
6. Keep the current one-review rule unless the maintainer explicitly raises the
   review count.

## Verification Ideas

File and API checks:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/contents/.github/CODEOWNERS --jq .path
gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq ".errors"
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews --jq "{required_approving_review_count,require_code_owner_reviews}"
```

Expected:

- `.github/CODEOWNERS` exists.
- CODEOWNERS errors are empty.
- `require_code_owner_reviews` is `true`.

Behavior check:

- Open a test PR that changes `.github/workflows/validate.yml` or
  `build-extension.js`.
- Confirm GitHub requests the expected owner.
- Confirm the PR cannot merge until a code-owner approval is present.

## Explicit Non-Goals

- Do not create non-existent team references.
- Do not require all generated locale or archive docs to get owner review.
- Do not raise the required review count in the same step unless the maintainer
  explicitly chooses that policy.

## Open Questions

- Is `@SysAdminDoc` the only valid code owner, or should an organization team be
  created for security/release ownership?
- Should code-owner review be required for all source paths, or only
  security-sensitive files while the repo remains mostly maintainer-owned?
