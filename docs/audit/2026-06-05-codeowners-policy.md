# CODEOWNERS Policy Audit - 2026-06-05

## Scope

- `.github/CODEOWNERS`
- `tests/hardening.test.js`
- `docs/repo-settings.md`
- `ROADMAP.md`
- `RESEARCH_REPORT.md`
- `COMPLETED.md`
- GitHub `main` branch pull-request review protection

## Finding

`main` already requires one approving review, but the repository had no
CODEOWNERS file in `.github/`, the repository root, or `docs/`. Branch
protection also does not require code-owner review. Security-sensitive changes
to workflow policy, dependency manifests, release/signing tooling, extension
core permissions and proxy surfaces, and the Python companion therefore relied
on manual reviewer memory instead of path-aware ownership.

GitHub's CODEOWNERS documentation says the file can live in `.github/`, root, or
`docs/`; owners must have write access; pull requests use the base branch's file
for review requests; and branch protection can require code-owner approval. The
live repository is a personal public repository owned by `@SysAdminDoc`, so this
pass avoided non-existent organization team references.

## Fix

- Added `.github/CODEOWNERS`.
- Mapped repository policy, dependency manifests, release/signing tooling,
  hardening gates, security/privacy docs, extension manifest/background/core
  code, and `astra_downloader/` to `@SysAdminDoc`.
- Protected `.github/` itself so changes to CODEOWNERS, workflows, CodeQL, and
  Dependabot configuration request the same owner.
- Added a hardening regression that asserts the critical path set remains owned
  by `@SysAdminDoc` and that no organization-team owner is referenced before a
  real write-enabled team exists.

## Verification

- `gh repo view SysAdminDoc/Astra-Deck --json
  nameWithOwner,isPrivate,owner,viewerPermission,defaultBranchRef` confirmed
  the personal repository owner and current admin permission.
- `gh api
  repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews
  --jq .` confirmed one required approving review and
  `require_code_owner_reviews: false`.
- `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq .` returned
  `404 Not Found` before the CODEOWNERS file exists on the default branch.
- `node --test tests/hardening.test.js --test-name-pattern="CODEOWNERS protects"`.
- `gh api
  "repos/SysAdminDoc/Astra-Deck/codeowners/errors?ref=codex/research-feature-plan-2026-06-05"
  --jq .` returned `errors: []` after the branch push.
- `npm test`.
- `npm run check`.
- `npm run build`.

## Remaining Hosted Step

After the branch lands on `main`, run
`gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq ".errors"` against
the default branch. If the errors list is empty, enable
`require_code_owner_reviews` on the `main` branch protection rule.
