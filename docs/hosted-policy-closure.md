# Hosted Policy Closure Runbook

Last updated: 2026-06-06

This runbook sequences the hosted repository settings that cannot be finished
by source edits alone. Use it only after the current feature branch has landed
on `main` and a maintainer explicitly chooses to change repository settings.

## Current Read-Only Snapshot

Captured on 2026-06-06 with `GH_PROMPT_DISABLED=1`:

- Actions permissions:
  - `enabled: true`
  - `allowed_actions: all`
  - `sha_pinning_required: false`
  - `selected_actions_url: null`
- Workflow token policy:
  - `default_workflow_permissions: read`
  - `can_approve_pull_request_reviews: false`
- Security analysis:
  - public repository
  - secret scanning enabled
  - secret scanning push protection enabled
  - Dependabot security updates disabled
  - secret scanning validity checks disabled
  - secret scanning non-provider patterns disabled
  - dependency graph status is not exposed in the returned API block
- `main` pull-request review policy:
  - `required_approving_review_count: 1`
  - `require_code_owner_reviews: false`
- CODEOWNERS:
  - `.github/CODEOWNERS` exists on the feature branch.
  - `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors` returns `404` on
    the default branch until the file lands on `main`.
- Latest public release `v4.46.0`:
  - 12 assets are attached.
  - `AstraDownloader.exe` and `AstraDownloader.exe.sha256` are not attached.

## Source-State Preconditions

Before changing hosted settings, verify source-side controls are already in the
default branch:

```powershell
$env:GH_PROMPT_DISABLED = '1'
git fetch origin
git branch --show-current
git log -1 --oneline origin/main
gh api repos/SysAdminDoc/Astra-Deck/contents/.github/CODEOWNERS --jq .path
rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)" .github/workflows
rg -n "uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v" .github/workflows
npm run policy:actions
```

Expected:

- The current branch is either `main` or a branch rebased onto the target
  `main` commit.
- `.github/CODEOWNERS` exists on `main`.
- The mutable-ref grep returns no matches.
- The SHA-ref grep lists every external action.
- `npm run policy:actions` emits the selected-actions payload and fails if a
  workflow action is not SHA-pinned or lacks its same-line version comment.

## Step 1: Refresh Hosted State

Run read-only probes first:

```powershell
$env:GH_PROMPT_DISABLED = '1'
gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq '{enabled,allowed_actions,sha_pinning_required,selected_actions_url}'
gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/workflow --jq .
gh api repos/SysAdminDoc/Astra-Deck --jq '{private,security_and_analysis:.security_and_analysis}'
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews --jq '{required_approving_review_count,require_code_owner_reviews}'
gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq .
gh release view v4.46.0 --repo SysAdminDoc/Astra-Deck --json tagName,publishedAt,assets,url
```

Record the exact outputs in `docs/repo-settings.md` before and after any
hosted change. Do not copy tokens, cookies, local paths containing secrets, or
private alert values into tracked docs.

## Step 2: Enable Dependency Graph Before Dependency Review Enforcement

Why this comes first:

- `Validate / Dependency review` is PR-only.
- GitHub says dependency review becomes available when dependency graph is
  enabled.
- The current API snapshot still shows Dependabot security updates disabled and
  does not expose a dependency graph status field.

Maintainer action:

1. In GitHub repository settings, enable dependency graph where available.
2. Enable Dependabot alerts and security updates if the UI offers them for this
   public repository.
3. Rerun the dependency PR or open a throwaway PR that changes `package-lock.json`
   or `astra_downloader/requirements.txt`.
4. Confirm `Validate / Dependency review` no longer fails with repository setup
   text. It should either pass or fail only on concrete vulnerable dependency
   findings.

Read-only verification:

```powershell
$env:GH_PROMPT_DISABLED = '1'
gh api repos/SysAdminDoc/Astra-Deck --jq '{private,security_and_analysis:.security_and_analysis}'
gh run list --workflow Validate --limit 10
```

Keep `Dependency review` out of required direct-push checks. Add it as required
only after a PR run proves the exact status context is stable for pull requests.

## Step 3: Enforce CODEOWNERS After It Lands On `main`

Why this comes after merge:

- CODEOWNERS review requests and syntax validation are evaluated against the
  base branch.
- The default-branch CODEOWNERS errors endpoint returns `404` until the file is
  present on `main`.

Read-only verification before enforcement:

```powershell
$env:GH_PROMPT_DISABLED = '1'
gh api repos/SysAdminDoc/Astra-Deck/contents/.github/CODEOWNERS --jq .path
gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq .
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews --jq '{required_approving_review_count,require_code_owner_reviews}'
```

Maintainer action:

1. Keep `required_approving_review_count: 1`.
2. Enable `require_code_owner_reviews` on `main`.
3. Open a test PR touching `.github/workflows/validate.yml` or
   `build-extension.js`.
4. Confirm the PR requests `@SysAdminDoc` and cannot merge until a code-owner
   approval is present.

## Step 4: Restrict Actions Sources And Require SHA Pins

Why this comes after hosted workflow proof:

- `Build & Release` uses `contents: write`, `id-token: write`, and
  `attestations: write`.
- Source-side workflow refs are SHA-clean, but a repository selected-actions
  policy can break workflows if a deliberate non-GitHub-owned action is not
  allowed.

Current action-source inventory:

- GitHub-owned / GitHub-maintained action owners used in workflows:
  - `actions/*`
  - `github/codeql-action/*`
- Deliberate non-GitHub-owned action:
  - `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`
    (`# v1.7.2`)

Target policy:

- `allowed_actions: selected`
- `sha_pinning_required: true`
- GitHub-owned actions allowed.
- Broad verified-creator allowance disabled.
- `patterns_allowed` contains only deliberate non-GitHub-owned workflow
  dependencies, currently the pinned `browser-actions/setup-firefox` ref.

Read-only proof before mutation:

```powershell
$env:GH_PROMPT_DISABLED = '1'
rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)" .github/workflows
rg -n "uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v" .github/workflows
npm run policy:actions
gh run list --workflow Validate --limit 5
gh run list --workflow "Build & Release" --limit 5
gh run list --workflow CodeQL --limit 5
gh run list --workflow "yt-dlp Smoke" --limit 5
```

Maintainer action:

1. Change the repository Actions policy to selected actions and reusable
   workflows.
2. Allow GitHub-owned actions.
3. Keep verified creators disabled unless a future workflow deliberately needs
   that broader trust boundary.
4. Add `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`
   to the selected-action allowlist, matching the `patterns_allowed` value from
   `npm run policy:actions`.
5. Enable full-length SHA-pinning requirement.

Post-change verification:

```powershell
$env:GH_PROMPT_DISABLED = '1'
gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq '{enabled,allowed_actions,sha_pinning_required,selected_actions_url}'
gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/selected-actions --jq .
```

Then run or wait for hosted proof:

- `Validate`
- `Build & Release` dry-run or the next tag run
- `yt-dlp Smoke`
- `CodeQL`

If any workflow fails with an Actions policy error, do not loosen to `all`.
Add the exact pinned action ref to `patterns_allowed` only after confirming the
workflow really needs it.

## Step 5: Keep Release Assets Separate

Do not attach `AstraDownloader.exe` or `AstraDownloader.exe.sha256` while doing
repository policy closure unless the same run is explicitly a companion release
pass. The latest release currently lacks those two assets, and that remains the
Cycle 22 companion release-channel item.

For a companion release pass, use `docs/signing-keys.md` and the companion
release-channel roadmap item instead of this repository-settings runbook.

## Final Evidence To Record

After each hosted change, update `docs/repo-settings.md` with:

- date and command used for read-only verification;
- exact non-secret API fields before and after;
- hosted workflow run IDs or URLs that proved the setting;
- whether `Dependency review`, CODEOWNERS, selected Actions, SHA pinning, and
  companion release assets remain open or closed.

Update `ROADMAP.md`, `RESEARCH_REPORT.md`, and `AUTONOMOUS-LOOP-STATE.md` in
the same docs-only pass.
