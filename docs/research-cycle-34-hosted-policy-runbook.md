# Research Cycle 34 - Hosted Policy Runbook

Date: 2026-06-06

## Research Area

Turn the Cycle 33 hosted/manual security closure plan into a tracked runbook
without mutating GitHub repository settings.

## Local Files Reviewed

- `docs/repo-settings.md`
- `docs/research-cycle-33-hosted-policy-closure.md`
- `.github/workflows/validate.yml`
- `.github/workflows/build.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/yt-dlp-smoke.yml`
- `.github/CODEOWNERS`
- `.github/dependabot.yml`
- `.github/codeql.yml`
- `ROADMAP.md`
- `AUTONOMOUS-LOOP-STATE.md`

## Live Read-Only Checks

Run with `GH_PROMPT_DISABLED=1`:

- `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions --jq
  '{enabled,allowed_actions,sha_pinning_required,selected_actions_url}'`
  returned `allowed_actions: all`, `sha_pinning_required: false`.
- `gh api repos/SysAdminDoc/Astra-Deck/actions/permissions/workflow --jq .`
  returned read-only workflow token defaults and disabled workflow-created PR
  approvals.
- `gh api repos/SysAdminDoc/Astra-Deck --jq
  '{private,security_and_analysis:.security_and_analysis}'` returned a public
  repo with Dependabot security updates disabled, secret scanning enabled, push
  protection enabled, and no dependency graph field in the returned block.
- `gh api
  repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_pull_request_reviews
  --jq '{required_approving_review_count,require_code_owner_reviews}'`
  returned one required approving review and code-owner review disabled.
- `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq .` returned
  `404 Not Found`, matching the existing note that `.github/CODEOWNERS` has not
  landed on the default branch yet.
- `gh release view v4.46.0 --repo SysAdminDoc/Astra-Deck --json
  tagName,publishedAt,assets,url` returned 12 assets and no
  `AstraDownloader.exe` / `AstraDownloader.exe.sha256`.
- `rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)|uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v"
  .github\workflows` showed every external workflow action pinned to a
  full-length SHA with a same-line version comment.

## Key Finding

The source branch is SHA-clean, but the selected-actions policy cannot be
enabled with only GitHub-owned actions allowed. `browser-actions/setup-firefox`
is used by the release workflow and is not GitHub-owned, so the policy needs a
deliberate allowlist entry for its pinned SHA:

`browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`

## External Sources

- GitHub dependency review:
  `https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review`
- GitHub CODEOWNERS:
  `https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners`
- GitHub Actions permissions REST API:
  `https://docs.github.com/en/rest/actions/permissions`
- GitHub Actions secure use:
  `https://docs.github.com/en/actions/reference/security/secure-use`

## Roadmap Change

- Added `docs/hosted-policy-closure.md`.
- Updated `docs/repo-settings.md` with the 2026-06-06 read-only snapshot and
  runbook pointer.
- Updated `ROADMAP.md` Cycle 33 status and added Cycle 34 notes.
- Updated continuation state so the next local-first cycle can move back to the
  authenticated selector capture lane unless the maintainer asks for hosted
  setting changes.

## Next Leads

- Implement or deepen the authenticated/menu-state selector capture lane.
- Run headed Chrome/Edge and Firefox optional-host prompt accept/deny/revoke
  smoke when browser access is available.
- Use `docs/hosted-policy-closure.md` only after the branch has landed on
  `main` and hosted setting mutation is explicitly requested.
