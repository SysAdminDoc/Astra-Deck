# GitHub Actions SHA Pinning Audit - 2026-06-05

## Scope

- `.github/workflows/validate.yml`
- `.github/workflows/build.yml`
- `.github/workflows/yt-dlp-smoke.yml`
- `.github/workflows/codeql.yml`
- `tests/hardening.test.js`
- `docs/repo-settings.md`

## Finding

The repository Actions policy snapshot still allows all actions and does not
require full-length SHA pins:

- `allowed_actions: all`
- `sha_pinning_required: false`

After the Node 24 action-major migration and CodeQL setup, workflow `uses:` refs
were still tag-pinned. This left trusted action refs movable and meant the
hosted repository SHA-pinning policy could not be enabled without first landing
source changes.

While resolving refs, `actions/dependency-review-action@v5` was found not to be
an upstream tag. The current v5 release is `v5.0.0`.

## Fix

Every external workflow action ref is now pinned to a full 40-character commit
SHA with a same-line version comment:

| Action | Pinned commit | Version comment |
| --- | --- | --- |
| `actions/checkout` | `df4cb1c069e1874edd31b4311f1884172cec0e10` | `v6` |
| `actions/setup-node` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` | `v6` |
| `actions/setup-python` | `a309ff8b426b58ec0e2a45f0f869d46889d02405` | `v6` |
| `actions/upload-artifact` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | `v7` |
| `actions/dependency-review-action` | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | `v5.0.0` |
| `actions/attest-build-provenance` | `a2bbfa25375fe432b6a289bc6b6cd05ecd0c4c32` | `v4` |
| `actions/attest-sbom` | `c604332985a26aa8cf1bdc465b92731239ec6b9e` | `v4` |
| `github/codeql-action/init` | `8aad20d150bbac5944a9f9d289da16a4b0d87c1e` | `v4` |
| `github/codeql-action/analyze` | `8aad20d150bbac5944a9f9d289da16a4b0d87c1e` | `v4` |

The hardening suite now rejects mutable tag or branch action refs in workflows,
requires every `uses:` line to carry a 40-character SHA plus version comment,
and pins the resolved upstream commits.

## Remaining Hosted Settings Work

After this branch lands and hosted workflow runs prove the pinned refs execute,
change repository Actions permissions to:

- `allowed_actions: selected`
- GitHub-owned actions allowed
- Broad verified-creator allowance disabled
- `sha_pinning_required: true`
- `patterns_allowed` populated only for deliberate non-GitHub-owned actions or
  reusable workflows

## Verification

- `rg -n "uses:\s*[^#]+@(v[0-9]+|main|master)(\s|$)" .github/workflows`
  returned no matches.
- `rg -n "uses:\s*[^#]+@[0-9a-f]{40}\s+#\s+v" .github/workflows` listed all
  20 workflow action refs.
- `node --test tests/hardening.test.js --test-name-pattern="GitHub workflows pin|CodeQL scans|release manifest generation|validate workflow audits"`
  passed.
- Full-cycle verification is recorded in `AUTONOMOUS-LOOP-STATE.md`.
