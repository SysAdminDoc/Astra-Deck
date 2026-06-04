# Project Research and Feature Plan - Cycle 12 Dependency Review Enablement

Date: 2026-06-04

## Executive Summary

Astra Deck now has stronger dependency gates in CI, but the new PR-only
Dependency review job is failing at platform setup before it can inspect a
dependency diff. The open Dependabot PR for `actions/setup-python` v6 has all
other `Validate` jobs green, while `Dependency review` reports that the
repository does not support dependency review until the dependency graph is
enabled.

Recommended next item:

1. P1 - Enable dependency graph and Dependabot alerts/security updates where
   available.
2. P1 - Rerun PR #11 and confirm Dependency review succeeds or fails only on a
   real vulnerable-dependency finding.
3. P2 - Keep PR-only Dependency review separate from direct-push required checks
   until a pull-request run proves the exact required-check behavior.

## Evidence Reviewed

Local/current sources inspected:

- `gh pr list --state open --limit 10 --json number,title,headRefName,url,statusCheckRollup`
- `gh run view 26950993002 --log-failed`
- `gh api repos/SysAdminDoc/Astra-Deck --jq "{private,security_and_analysis:.security_and_analysis}"`
- `.github/workflows/validate.yml`
- `docs/repo-settings.md`
- `ROADMAP.md`
- `RESEARCH_REPORT.md`

Open PR evidence:

- PR #11: `ci(deps): bump actions/setup-python from 5 to 6`
- Branch: `dependabot/github_actions/actions/setup-python-6`
- URL: `https://github.com/SysAdminDoc/Astra-Deck/pull/11`
- `Validate / JS tests + check gate`: success.
- `Validate / Python dependency audit`: success.
- `Validate / Python downloader tests`: success.
- `Validate / Dependency review`: failure.

Failed job log:

```text
Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled, see https://github.com/SysAdminDoc/Astra-Deck/settings/security_analysis
```

Repository security-analysis API probe:

```powershell
gh api repos/SysAdminDoc/Astra-Deck --jq "{private,security_and_analysis:.security_and_analysis}"
```

Observed:

```json
{
  "private": false,
  "security_and_analysis": {
    "dependabot_security_updates": {
      "status": "disabled"
    },
    "secret_scanning": {
      "status": "enabled"
    },
    "secret_scanning_non_provider_patterns": {
      "status": "disabled"
    },
    "secret_scanning_push_protection": {
      "status": "enabled"
    },
    "secret_scanning_validity_checks": {
      "status": "disabled"
    }
  }
}
```

External sources reviewed:

- GitHub Docs - About dependency review:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependency-review
- GitHub Docs - About the dependency graph:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependency-graph
- GitHub Docs - About Dependabot alerts:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependabot-alerts
- `actions/dependency-review-action` README:
  https://github.com/actions/dependency-review-action

Relevant source facts:

- GitHub docs state that dependency review becomes available when the dependency
  graph is enabled.
- Dependency review supports the same package ecosystems as the dependency
  graph.
- The Dependency review action scans dependency changes in pull requests and can
  fail a pull request when newly introduced dependencies violate the configured
  vulnerability or license policy.
- The action README lists public repositories as supported and documents
  branch-protection use for requiring the check before merge.
- Dependabot alerts scan the default branch and are generated when the advisory
  database changes or the dependency graph changes.

## Current Gap

The workflow and repository settings are now out of phase:

- `.github/workflows/validate.yml` contains a PR-only Dependency review job.
- `docs/repo-settings.md` correctly keeps Dependency review out of direct-push
  required checks for now.
- The first open PR that exercises the job cannot run dependency review because
  the repository security-analysis setting has not been enabled or exposed as
  expected.

That leaves dependency maintenance in a misleading state: the job is present,
but it fails on platform readiness before it can report whether the dependency
change is safe.

## Recommended Roadmap Item

Add one P1 manual-gated item:

**Enable dependency graph before requiring Dependency review.**

Acceptance shape:

- Enable dependency graph and Dependabot alerts/security updates for the
  repository where available.
- Rerun PR #11.
- Confirm `Validate / Dependency review` succeeds, or fails only with concrete
  vulnerable-dependency findings.
- Keep direct-push branch protection limited to checks that run on direct pushes.
- Add Dependency review to required PR checks only after a pull-request run
  confirms the exact status-check behavior.
- Record the final required contexts and security-analysis policy in
  `docs/repo-settings.md`.

## Implementation Notes

UI path:

1. Repository Settings.
2. Code security and analysis.
3. Enable dependency graph and Dependabot alerts/security updates where GitHub
   exposes those switches for the repository.
4. Rerun the failed PR #11 workflow.
5. Update branch protection only after the rerun proves the final check context.

API verification:

```powershell
gh api repos/SysAdminDoc/Astra-Deck --jq ".security_and_analysis"
```

Expected after enablement:

- GitHub exposes dependency graph / Dependabot alert status where available.
- Dependabot security updates are enabled if the maintainer chooses the full
  vulnerability-remediation path.

PR verification:

```powershell
gh run rerun 26950993002 --failed
gh pr checks 11
```

Expected after rerun:

- `Dependency review` no longer fails with repository unsupported.
- If the check fails, the log names the vulnerable dependency or policy
  violation that needs review.

## Verification Ideas

- Use PR #11 as the live proof because it already changes a GitHub Actions
  dependency and has all non-Dependency-review `Validate` jobs passing.
- If Dependency review remains unsupported after settings are enabled, confirm
  whether the GitHub API is withholding the dependency-graph field for this
  repository or whether an organization policy controls it.
- Confirm branch protection still does not require a skipped PR-only context on
  direct pushes.

## Explicit Non-Goals

- No source-code change is required for the primary remediation.
- No force-push, reset, or branch rewrite.
- No change to dependency versions is proposed by this research pass.
- No automatic merge of Dependabot PRs; this item is about making the security
  gate operational before human review.

## Open Questions

- Should the maintainer enable only dependency graph / alerts, or also
  Dependabot security updates for automatic vulnerable-dependency PRs?
- Should Dependency review become a required PR check after the first clean PR
  run, or remain advisory until several dependency PRs have passed?
- If GitHub does not expose dependency graph status through the current API
  response, should `docs/repo-settings.md` record the UI-verified state instead?
