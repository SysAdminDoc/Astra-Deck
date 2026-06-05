# Firefox web-ext release gate - 2026-06-05

## Scope

- `scripts/check-firefox-webext.js`
- `scripts/smoke-firefox-webext.js`
- `.github/workflows/build.yml`
- Firefox staged manifests generated from `extension/manifest.json`

## Finding

Firefox release artifacts were manifest-patched, but no AMO-style lint or clean
Firefox profile launch exercised those staged manifests before release upload.
The first `web-ext lint` run found real release blockers: all PNG icons were
non-square, the generated Firefox data-consent minimum was below the Android
linter floor, and two TrustedHTML paths still used raw `innerHTML` sinks.

## Fix

- Exact-pinned `web-ext@10.3.0`.
- Added `npm run check:firefox`, which stages both store-safe and GitHub-full
  Firefox manifests and runs `web-ext lint --source-dir` against each.
- Added `npm run smoke:firefox`, which stages the store-safe Firefox manifest and
  launches it via `web-ext run` in a clean headless Firefox profile against
  `https://www.youtube.com/watch?v=jNQXAC9IVRw`.
- Wired `check:firefox` into `npm run check`.
- Wired `smoke:firefox` into the tag release workflow after artifact generation
  using pinned `browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795`.
- Padded manifest PNG icons to square dimensions.
- Raised the Firefox data-consent floor to Firefox 142+ / `strict_min_version:
  142.0`.
- Removed raw `innerHTML` assignments from TrustedHTML write paths.

## Verification

- `npm run check:firefox`
- `npm run smoke:firefox`
- `node --test tests/firefox-injection-audit.test.js`
- `node --test tests/hardening.test.js --test-name-pattern="Firefox|manifest PNG|TrustedTypes|workflow actions"`

Local smoke evidence:

- Firefox: `C:\Program Files\Mozilla Firefox\firefox.exe` (`Mozilla Firefox
  151.0.3`)
- Profile: `store-safe`
- Manifest: MV3, Gecko ID `ytkit@sysadmindoc.github.io`
- Start URL: `https://www.youtube.com/watch?v=jNQXAC9IVRw`
- Result: clean 25-second startup window; `web-ext run` installed the staged
  manifest as a temporary add-on and reported automatic reload disabled.
