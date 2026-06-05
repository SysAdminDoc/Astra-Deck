# Companion Release Channel Audit - 2026-06-05

## Scope

- `astra_downloader/astra_downloader.py`
- `astra_downloader/test_astra_downloader.py`
- `scripts/generate-release-manifest.js`
- `scripts/stage-companion-release.js`
- `docs/signing-keys.md`
- Latest public GitHub Release `v4.46.0`

## Finding

The companion `/update` endpoint compared local `APP_VERSION` to raw `main`,
downloaded `AstraDownloader.exe` from the latest GitHub Release, and previously
continued when the `.sha256` sidecar was unavailable. The release manifest
generator knew companion asset names and could emit a sidecar if an EXE was
already in `build/`, but the local release checklist did not stage the EXE, and
the required release asset set did not fail when companion assets were missing.

The live latest release `v4.46.0` still does not attach `AstraDownloader.exe` or
`AstraDownloader.exe.sha256`, so public release upload and live `gh release
download` verification remain maintainer release actions.

## Fix

- Added `scripts/stage-companion-release.js` and `npm run
  release:stage-companion` to validate an MZ-header EXE and copy it into
  `build/AstraDownloader.exe`.
- Added `--require-companion` / `ASTRA_REQUIRE_COMPANION_RELEASE=1` enforcement
  to `scripts/generate-release-manifest.js`.
- Companion-required manifest generation now requires `AstraDownloader.exe` and
  `AstraDownloader.exe.sha256`, emits `companionUpdateRequired: true`, and
  includes both files in `release-manifest.json` and `SHA256SUMS`.
- Changed the companion self-update path to fail when the SHA-256 sidecar is
  unavailable, instead of proceeding with only MZ and size validation.
- Updated the local release checklist with the companion build/stage/manifest
  path and the rule that `APP_VERSION` must not advance beyond deployed release
  assets.

## Verification

- `python -m pytest astra_downloader/test_astra_downloader.py -q -k
  "CompanionUpdateEndpointTests or sha256"`.
- `node --test tests/hardening.test.js --test-name-pattern="release manifest generation"`.
- Missing-EXE failure: `node scripts/generate-release-manifest.js
  --require-companion` failed before companion staging.
- Temporary fixture proof: staged a 2048-byte MZ-header EXE and verified that
  `release-manifest.json`, `AstraDownloader.exe.sha256`, and `SHA256SUMS`
  included matching companion entries.
- Real build proof: `python astra_downloader/build.py` produced a 44.7 MB
  `AstraDownloader.exe`; staging it and running `npm run release:manifest --
  --require-companion` produced a matching sidecar and companion manifest
  entries.
- Latest release probe: `gh release view v4.46.0 --json
  tagName,targetCommitish,publishedAt,assets,url` confirmed the public release
  still lacks the companion EXE and sidecar.
