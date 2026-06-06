# Release Digest Verifier - 2026-06-06

## Scope

- `scripts/compare-release-digests.js`
- `tests/release-digests.test.js`
- `package.json`
- `README.md`
- `docs/signing-keys.md`
- `ROADMAP.md`

## Finding

The local release checklist required comparing uploaded GitHub Release asset
digests against `build/SHA256SUMS`, but it did not provide a reusable command
for that comparison. GitHub release assets expose SHA-256 digests through the
Release REST API, and `gh release view --json assets` exposes the same
`digest` field, so the comparison can be automated without downloading every
asset.

References:

- https://docs.github.com/en/rest/releases/assets
- https://cli.github.com/manual/gh_release_view

## Fix

- Added `npm run release:verify-digests`, backed by
  `scripts/compare-release-digests.js`.
- The helper reads `build/SHA256SUMS`, computes the checksum file's own local
  SHA-256, loads release asset digests from either live `gh release view` or a
  fixture JSON file, and fails on missing remote assets, extra remote assets,
  missing `sha256:` digests, duplicate asset names, local checksum drift, and
  digest mismatches.
- Added `--repo`, `--tag`, `--checksums`, and `--assets-json` flags so release
  operators can use the live GitHub Release path while tests can stay offline.
- Updated the signing checklist to use the command after upload.

## Verification

- `node --check scripts/compare-release-digests.js`
- `node --test tests/release-digests.test.js`
- `gh release view v4.46.0 --repo SysAdminDoc/Astra-Deck --json tagName,assets`
  confirmed live release assets expose `digest: "sha256:..."`.
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Remaining Work

- Run `npm run release:verify-digests -- --tag vX.Y.Z` only from the
  maintainer-local release directory whose signed CRX/XPI files were uploaded.
  Validation builds use ephemeral CRX keys and are not expected to match public
  release CRX digests.
