# CodeQL PR Alert Cleanup - 2026-06-05

## Scope

- `tests/hardening.test.js`
- `scripts/stage-companion-release.js`

## Finding

After `1907e09`, GitHub's CodeQL pull-request check reported six high-severity
alerts on the changed PR surface:

- `js/incomplete-url-substring-sanitization` on CSP assertions in
  `tests/hardening.test.js`.
- `js/file-system-race` on the companion EXE staging validator in
  `scripts/stage-companion-release.js`.

The workflow analysis jobs themselves passed; the failing check was the CodeQL
PR alert gate.

## Fix

- Replaced CSP URL substring assertions with `connect-src` directive token
  parsing so tests check exact origins rather than substrings.
- Added a canary that rejects a lookalike URL token such as
  `https://api.openai.com.evil`.
- Reworked companion staging to open the EXE once, validate metadata with
  `fs.fstatSync(fd)`, read the bytes from that same descriptor, and write those
  validated bytes to `build/AstraDownloader.exe`.
- Added hardening assertions that the staging script avoids `fs.existsSync` and
  post-validation `fs.copyFileSync` path copies.

## Verification

- `node --check scripts/stage-companion-release.js`
- `node --test tests/hardening.test.js --test-name-pattern="release manifest generation|CSP scopes|build-extension emits|runtime optional host|Cobalt fallback origin"`
- `rg -n "\.includes\('https?://|\.includes\(\"https?://" tests/hardening.test.js`
- Full-cycle verification is recorded in `AUTONOMOUS-LOOP-STATE.md`.
