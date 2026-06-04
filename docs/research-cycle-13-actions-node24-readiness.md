# Project Research and Feature Plan - Cycle 13 Actions Node 24 Readiness

Date: 2026-06-04

## Executive Summary

Astra Deck's required checks are now green, but the CI platform is already
warning that several GitHub-owned JavaScript actions still run on Node 20.
GitHub's runner migration starts defaulting actions to Node 24 on 2026-06-16,
so this is an imminent release-readiness risk for both the `Validate` workflow
and the tag-driven `Build & Release` workflow.

Recommended next item:

1. P1 - Upgrade workflow actions to Node 24-ready major versions.
2. P1 - Prove `Validate` and `Build & Release` no longer emit Node 20 runtime
   warnings.
3. P2 - Trigger `yt-dlp Smoke` manually after the action bump because its
   monthly cadence may otherwise hide the warning until the next scheduled run.

## Evidence Reviewed

Local/current sources inspected:

- `rg -n "uses:" .github/workflows`
- `.github/workflows/validate.yml`
- `.github/workflows/build.yml`
- `.github/workflows/yt-dlp-smoke.yml`
- `gh run view 26953094214 --log`
- `gh run view 26951406026 --log`
- `gh pr list --state open`
- `gh release view -R actions/checkout --json tagName,publishedAt,url`
- `gh release view -R actions/setup-node --json tagName,publishedAt,url`
- `gh release view -R actions/setup-python --json tagName,publishedAt,url`
- `gh release view -R actions/upload-artifact --json tagName,publishedAt,url`
- `gh release view -R actions/dependency-review-action --json tagName,publishedAt,url`

Current workflow action inventory:

```text
.github/workflows/build.yml:18:      - uses: actions/checkout@v4
.github/workflows/build.yml:19:      - uses: actions/setup-node@v4
.github/workflows/build.yml:48:        uses: actions/upload-artifact@v4
.github/workflows/build.yml:56:        uses: actions/attest-build-provenance@v4
.github/workflows/build.yml:62:        uses: actions/attest-sbom@v4
.github/workflows/validate.yml:31:      - uses: actions/checkout@v4
.github/workflows/validate.yml:32:      - uses: actions/dependency-review-action@v5
.github/workflows/validate.yml:42:      - uses: actions/checkout@v4
.github/workflows/validate.yml:43:      - uses: actions/setup-node@v4
.github/workflows/validate.yml:66:        uses: actions/upload-artifact@v4
.github/workflows/validate.yml:76:      - uses: actions/checkout@v4
.github/workflows/validate.yml:77:      - uses: actions/setup-python@v5
.github/workflows/validate.yml:94:        uses: actions/upload-artifact@v4
.github/workflows/validate.yml:107:      - uses: actions/checkout@v4
.github/workflows/validate.yml:108:      - uses: actions/setup-python@v5
.github/workflows/yt-dlp-smoke.yml:18:      - uses: actions/checkout@v4
.github/workflows/yt-dlp-smoke.yml:20:      - uses: actions/setup-python@v5
```

Latest `main` Validate run:

- Run: `26953094214`
- Event: push to `main`
- Conclusion: success
- Warning evidence:
  - `JS tests + check gate` warns for `actions/checkout@v4`,
    `actions/setup-node@v4`, and `actions/upload-artifact@v4`.
  - `Python dependency audit` warns for `actions/checkout@v4`,
    `actions/setup-python@v5`, and `actions/upload-artifact@v4`.
  - `Python downloader tests` warns for `actions/checkout@v4` and
    `actions/setup-python@v5`.

Latest tag Build & Release run:

- Run: `26951406026`
- Tag branch: `v4.46.0`
- Conclusion: success
- Warning evidence:
  - The build job warns for `actions/checkout@v4`, `actions/setup-node@v4`,
    and `actions/upload-artifact@v4`.

Current official release majors checked on 2026-06-04:

| Action | Current Astra pin | Latest official release observed |
| --- | --- | --- |
| `actions/checkout` | `v4` | `v6.0.3` |
| `actions/setup-node` | `v4` | `v6.4.0` |
| `actions/setup-python` | `v5` | `v6.2.0` |
| `actions/upload-artifact` | `v4` | `v7.0.1` |
| `actions/dependency-review-action` | `v5` | `v5.0.0` |

Open PR context:

- PR #11 already proposes `actions/setup-python` v6, but it is blocked by the
  Dependency review enablement issue from Cycle 12.
- No open PR currently covers `actions/checkout`, `actions/setup-node`, or
  `actions/upload-artifact`.

External sources reviewed:

- GitHub Changelog - Deprecation of Node 20 on GitHub Actions runners:
  https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
- `actions/checkout` README:
  https://github.com/actions/checkout
- `actions/setup-node` README:
  https://github.com/actions/setup-node
- `actions/setup-python` README:
  https://github.com/actions/setup-python
- `actions/upload-artifact` releases:
  https://github.com/actions/upload-artifact/releases

Relevant source facts:

- GitHub says JavaScript actions begin defaulting to Node 24 on 2026-06-16 and
  Node 20 is removed later in 2026.
- GitHub tells workflow users to update workflows to newer action versions that
  run on Node 24.
- `actions/checkout` v5+ documents Node 24 runtime support, and the current
  README examples use `checkout@v6`.
- `actions/setup-node` current README examples use `setup-node@v6`.
- `actions/setup-python` v6 documents a Node 20 -> Node 24 runtime upgrade and
  current examples use `setup-python@v6`.
- `actions/upload-artifact` v6+ release notes document Node 24 runtime support,
  with v7 now the latest observed major.

## Current Gap

The workflows are functionally green today, but the platform warning means they
are relying on an action runtime GitHub is actively moving away from. That has
three concrete failure modes:

- Required `Validate` checks may start behaving differently under forced Node 24
  before the repository has tested the newer action majors.
- The release workflow may discover a checkout/setup/upload behavior change only
  during a tag build.
- The monthly `yt-dlp Smoke` workflow may hide the same setup-python warning
  until its next scheduled run unless it is manually dispatched after migration.

## Recommended Roadmap Item

Add one P1 implementation item:

**Migrate GitHub Actions workflows to Node 24 action majors.**

Acceptance shape:

- Upgrade all `actions/checkout@v4` uses to a Node 24-ready major.
- Upgrade all `actions/setup-node@v4` uses to a Node 24-ready major.
- Upgrade all `actions/setup-python@v5` uses to a Node 24-ready major, either
  by merging PR #11 after Dependency review is enabled or by applying the same
  update in a broader workflow migration PR.
- Upgrade all `actions/upload-artifact@v4` uses to a Node 24-ready major and
  re-check artifact upload behavior.
- Leave attestation and Dependency review actions unchanged unless their logs
  emit runtime warnings or their current release notes call for an update.
- Re-run `Validate`, `Build & Release`, and `yt-dlp Smoke` after the migration.

## Implementation Notes

Suggested implementation order:

1. Resolve the Cycle 12 dependency graph / Dependency review enablement gap so
   PR #11 can run normally, or close PR #11 in favor of one combined workflow
   action migration PR.
2. Update all workflow action pins in one commit so mixed old/new action majors
   do not keep warnings alive in separate jobs.
3. Use a normal PR so required checks prove the migration.
4. After merge, run `Build & Release` against a tag ref, either with a
   throwaway tag push or `gh workflow run "Build & Release" --ref <tag>`, so
   tag-only artifact upload and attestation steps are exercised.
5. Run `yt-dlp Smoke` manually because its scheduled cadence is monthly.

## Verification Ideas

Validate:

```powershell
gh pr checks <migration-pr-number>
gh run view <validate-run-id> --log | Select-String "Node.js 20 actions are deprecated"
```

Expected:

- Required `Validate` contexts pass.
- The warning search returns no matches.

Release workflow:

```powershell
gh workflow run "Build & Release" --ref <tag>
gh run view <build-run-id> --log | Select-String "Node.js 20 actions are deprecated"
```

Expected:

- Build artifacts still upload.
- SBOM / release manifest generation still succeeds.
- Tag-only provenance and SBOM attestation steps are exercised.
- The warning search returns no matches.

Smoke workflow:

```powershell
gh workflow run "yt-dlp Smoke"
gh run view <smoke-run-id> --log | Select-String "Node.js 20 actions are deprecated"
```

Expected:

- The pinned extractor smoke still passes.
- The warning search returns no matches.

## Explicit Non-Goals

- No dependency version changes outside GitHub workflow actions.
- No temporary opt-out through `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`.
- No release version bump is required solely for this migration.

## Open Questions

- Should the project use the latest majors observed today, or the lowest
  Node 24-ready majors to minimize behavioral drift?
- Should Dependabot group GitHub Actions updates so checkout/setup/upload
  runtime migrations land together in the future?
- Should `Build & Release` gain a scheduled or manual preflight run before each
  public tag so action-runtime drift is caught before release day?
