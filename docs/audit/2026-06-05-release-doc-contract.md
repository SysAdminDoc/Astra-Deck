# Release Documentation Contract Audit - 2026-06-05

## Scope

- `docs/architecture.md`
- `docs/signing-keys.md`
- `.github/workflows/build.yml`
- `RESEARCH_REPORT.md`

## Finding

The current release workflow validates, builds, uploads `build/*` as workflow
artifacts, and creates tag-only build/SBOM attestations. It does not create
GitHub Releases. `docs/signing-keys.md` already documented that public release
publication remains maintainer-local because `ytkit.pem` never enters CI, but
`docs/architecture.md` still summarized CI as ending in `gh release create`.

## Fix

The architecture map now names the actual CI path and links the maintainer-local
publication contract back to `docs/signing-keys.md`. `RESEARCH_REPORT.md`
current status was updated so it no longer describes the architecture map as
stale.

## External References

- GitHub Docs: Using artifact attestations to establish provenance for builds.
- GitHub CLI manual: `gh attestation verify`.

## Verification

- `gh release view v4.46.0 --json tagName,targetCommitish,publishedAt,assets,url`
- `gh run view 26951406026 --json databaseId,event,headBranch,headSha,conclusion,status,url,jobs`
- `rg -n "gh release create|current public latest release lags|release workflow does not yet attach|privacy-policy source exists, but|Python dependency vulnerability auditing is not yet" docs RESEARCH_REPORT.md`

Remaining `gh release create` hits are historical cycle evidence or the separate
repo-working-notes item for `CLAUDE.md`, not the current architecture release
contract.
