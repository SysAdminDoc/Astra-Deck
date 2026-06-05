# CRX Signing Key Custody Audit - 2026-06-05

## Scope

- `build-extension.js`
- `.github/workflows/build.yml`
- `docs/signing-keys.md`
- `docs/architecture.md`
- `docs/cws-submission-checklist.md`
- `scripts/generate-release-manifest.js`
- `README.md`
- `CLAUDE.md`
- `tests/hardening.test.js`

## Finding

The P0 custody research pass found that the private CRX signing key was
ignored and untracked, but still present as `ytkit.pem` in the repo worktree.
`build-extension.js` also treated that root path as the default signing key and
could move newly generated key material back into the repo root. That violated
the documented policy that the maintainer key lives outside the checkout.

## Fix

- Added the external key contract:
  - `ASTRA_CRX_KEY_PATH`
  - `node build-extension.js --crx-key <path>`
  - default Windows path: `%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem`
- Made release builds (`--with-userscript` or `--bump`) default to external key
  mode and fail closed when the key path is missing or inside the repo
  worktree.
- Made validation builds use ephemeral CRX signing without retaining generated
  key material in the repo root or `build/`.
- Set CI `Build Release Artifacts` to `ASTRA_CRX_KEY_MODE=ephemeral` so
  workflow artifacts remain validation/provenance outputs and do not need the
  maintainer key.
- Moved the local ignored root key to
  `C:\Users\Xray\AppData\Local\Astra-Deck\keys\ytkit.pem` without reading or
  printing private key material.
- Recorded the public self-distributed CRX ID baseline:
  `lgbiefafhjdbplelniclnflbbilennlg`.

## Verification

- `Test-Path ytkit.pem` returned `False` after the move.
- `git ls-files --stage -- ytkit.pem` returned no tracked entry.
- `node --test tests/hardening.test.js --test-name-pattern="CRX signing key custody"` passed; the repo's hardening file ran broadly and reported 439 passing tests.

## Notes

Release-time offline backup remains a maintainer operational checklist item.
The repo now enforces and documents the custody boundary, but it cannot prove
the maintainer's off-machine backup state from the checkout.
