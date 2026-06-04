# Project Research and Feature Plan - Cycle 14 Release Doc Contract Reconciliation

Date: 2026-06-04

## Executive Summary

The v4.46.0 release catch-up closed the original release lag, checksum, SBOM,
and CI-attestation gaps, and `docs/signing-keys.md` now records the local
signing policy. A few current docs still describe the pre-closure release model
or imply that CI directly creates GitHub Releases. That is now inaccurate: CI
builds validation artifacts and attestations, while the maintainer publishes
maintainer-local public assets.

Recommended next item:

1. P2 - Reconcile release automation docs with the maintainer-local artifact
   contract.
2. P2 - Remove stale current-report wording that still says shipped release,
   privacy, and Python audit artifacts are absent.
3. P3 - Add a verification grep for stale release-publication wording in future
   release docs updates.

## Evidence Reviewed

Local/current sources inspected:

- `.github/workflows/build.yml`
- `docs/signing-keys.md`
- `docs/architecture.md`
- `docs/cws-submission-checklist.md`
- `RESEARCH_REPORT.md`
- `ROADMAP.md`
- `docs/research-cycle-8-ci-release-integrity.md`
- `gh release view v4.46.0 --json tagName,targetCommitish,publishedAt,assets,url`
- `gh run view 26951406026 --json databaseId,event,headBranch,headSha,conclusion,status,url,jobs`
- `rg -n "gh release|release upload|upload-artifact|attest|provenance|SHA256SUMS|release-manifest|Build & Release" .github scripts docs ROADMAP.md RESEARCH_REPORT.md package.json`

External sources reviewed:

- GitHub Docs - Using artifact attestations to establish provenance for builds:
  https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- GitHub CLI manual - `gh release verify-asset`:
  https://cli.github.com/manual/gh_release_verify-asset

## Current Release Contract

What the workflow does today:

- `.github/workflows/build.yml` runs on `workflow_dispatch` and `v*` tags.
- It grants `contents: write`, `id-token: write`, and `attestations: write`.
- It runs `npm test`, `npm run check`, tag/version verification,
  `npm run build:userscript`, `npm sbom`, and `npm run release:manifest`.
- It uploads `build/*` with `actions/upload-artifact`.
- On tag refs, it runs `actions/attest-build-provenance` and
  `actions/attest-sbom`.
- It does not run `gh release create` or `gh release upload`.

What the public release does today:

- `gh release view v4.46.0` reports tag `v4.46.0`, target
  `ac6a3633165547bbb0358191e43fe2038dbfbf73`, and 12 assets:
  eight profile-split extension artifacts, userscript, CycloneDX npm SBOM,
  `release-manifest.json`, and `SHA256SUMS`.
- GitHub's release asset API response includes `sha256:` digest fields for the
  published assets.
- ROADMAP Cycle 8 status records that local digest comparison verified the
  uploaded release assets against local files / `SHA256SUMS`, and that CI
  produced build/SBOM attestations for CI-built artifacts.

What signing policy says today:

- `docs/signing-keys.md` says CI never receives `ytkit.pem`.
- It also says CI does not publish GitHub Releases.
- The maintainer builds public CRX artifacts locally with `ytkit.pem` and
  uploads them with the local checksum manifest.

## Stale Or Conflicting Current Docs

Current, non-archived docs still have contradictions:

- `docs/architecture.md` summarizes CI as:
  `npm ci` -> `npm test` + `npm run check` -> tag check ->
  `npm run build:userscript` -> `gh release create`.
- Lower `RESEARCH_REPORT.md` sections still described release automation as
  lagging the source tree and missing checksum/provenance artifacts, even though
  the top freshness section and ROADMAP Cycle 8 status already mark those
  closure points shipped.
- The same lower report area still described Python dependency auditing and
  privacy/data-consent artifacts as absent, after Cycle 10 and Cycle 9 build
  work closed those gaps.

The current research-report contradictions were corrected in this cycle. The
remaining implementation item is to bring non-planning docs, especially
`docs/architecture.md`, into the same release contract.

## Recommended Roadmap Item

Add one P2 implementation item:

**Reconcile release automation docs with maintainer-local artifact contract.**

Acceptance shape:

- `docs/architecture.md` no longer says `.github/workflows/build.yml` creates a
  GitHub Release.
- The release docs name the current split:
  - CI validates, builds, uploads workflow artifacts, and attests CI-built
    outputs.
  - The maintainer publishes locally signed CRX artifacts, Firefox ZIP/XPI
    artifacts, and `SHA256SUMS`.
- Verification docs distinguish:
  - `gh attestation verify` for CI-built artifacts.
  - `gh release view --json assets` digest comparison against `SHA256SUMS` for
    maintainer-local public release assets.
- Current docs no longer say the latest public release lags v4.46.0 or that
  privacy / Python audit / release manifest artifacts are absent.

## Implementation Notes

Suggested implementation order:

1. Update the CI row in `docs/architecture.md`.
2. Check `docs/cws-submission-checklist.md`, `docs/signing-keys.md`, README
   release links, and any release checklist text for direct-release-vs-local
   signing contradictions.
3. Keep archived research unchanged, but make current docs explicitly mark
   historical findings as historical if they remain linked.

## Verification Ideas

Run:

```powershell
rg -n "gh release create|current public latest release lags|release workflow does not yet attach|privacy-policy source exists, but|Python dependency vulnerability auditing is not yet" docs RESEARCH_REPORT.md
```

Expected:

- No current false-positive statements outside archived research.
- Any remaining hits clearly live in `docs/archive/`, historical
  `docs/research-cycle-*` notes, or explicit Cycle 14 evidence/status text
  documenting the reconciliation item before it is closed.

Release contract spot checks:

```powershell
gh release view v4.46.0 --json tagName,targetCommitish,assets
gh run view 26951406026 --json jobs
```

Expected:

- Public release still has the 12 v4.46.0 assets and digest fields.
- The tag run still shows artifact upload plus build/SBOM attestation steps.

## Explicit Non-Goals

- No workflow behavior change is required by this item.
- No movement of `ytkit.pem` into CI.
- No new release tag.
- No change to archived research files unless a maintainer wants a separate
  archive annotation pass.

## Open Questions

- Should the architecture doc link directly to `docs/signing-keys.md` for the
  release-publication contract?
- Should the release checklist include both `gh attestation verify` and
  `gh release view --json assets` digest-comparison examples side by side?
- Should the project add a small stale-doc grep to CI, or keep this as manual
  release-review hygiene?
