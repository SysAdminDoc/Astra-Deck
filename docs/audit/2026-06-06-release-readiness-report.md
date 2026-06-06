# Release Readiness Report - 2026-06-06

## Scope

- `scripts/generate-release-readiness.js`
- `.github/workflows/build.yml`
- `tests/release-readiness.test.js`
- `README.md`
- `docs/signing-keys.md`
- `docs/architecture.md`

## Finding

Release publication proof was spread across the local signing checklist, the
release manifest generator, the build workflow, and manual operator steps. A
validation build could have store-safe/GitHub-full artifacts in `build/` while
still missing release-only proof such as the userscript artifact, SBOM,
`release-manifest.json`, and `SHA256SUMS`. Operators had to infer that gap from
several docs instead of one machine-readable report.

## Fix

- Added `npm run release:readiness`, which writes
  `build/release-readiness/release-readiness.json` and
  `build/release-readiness/release-readiness.md`.
- The report checks product-version surfaces, top-level build inventory,
  release-manifest presence/version/local-signing disclosure, root signing-key
  absence, SBOM presence, SHA256SUMS parsing/hash coverage, expected release
  asset presence, and companion EXE/sidecar truth.
- Added `--require-pass` for CI/release automation.
- Wired the tag build workflow to run `npm run release:readiness --
  --require-pass` after `npm run release:manifest` and before artifact upload.
- Kept readiness reports under a build subdirectory so rerunning
  `release:manifest` does not inventory the report files as release assets.

## Verification

- `node --check scripts/generate-release-readiness.js`
- `node --test tests/release-readiness.test.js`
- `node --test tests/hardening.test.js --test-name-pattern="release manifest generation"`
- `npm run release:readiness` against the current validation-build directory
  produced an expected FAIL report naming missing release-manifest, SBOM, and
  SHA256SUMS proof.
- `ASTRA_CRX_KEY_MODE=ephemeral npm run build:userscript`, SBOM generation,
  `npm run release:manifest`, and `npm run release:readiness --
  --require-pass` produced a PASS report with 12 passing checks.
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Remaining Work

- Public release upload, live digest comparison, and companion EXE/sidecar
  dry-run remain maintainer-local actions.
