# Chromium Optional Host Smoke - 2026-06-05

## Scope

- `scripts/smoke-chromium-optional-hosts.js`
- `package.json`
- `tests/optional-host-smoke.test.js`
- Store-safe Chromium manifest staging
- Runtime optional-host popup grant banner

## Finding

Runtime optional-host handling was covered by static, unit, and background
proxy tests, but the remaining release-smoke note was still only manual. The
important pre-prompt browser state is locally scriptable: load the real
store-safe MV3 extension into a fresh Chromium-family profile, seed enabled
optional enrichment features, open the real extension popup, and assert that the
Grant access banner lists every missing `optional_host_permissions` origin
before any grant is accepted.

Google Chrome on this PC is managed and rejects local unpacked extensions:
`--load-extension is not allowed in Google Chrome, ignoring.` Microsoft Edge
does allow the same unpacked MV3 load, so the smoke tries Chrome-compatible
candidates in order and falls back when Chrome policy blocks `--load-extension`.

## Fix

- Added `npm run smoke:optional-hosts`.
- Added a Node/CDP smoke using exact-pinned `ws@8.21.0`.
- The smoke stages the store-safe Chromium manifest, launches a fresh temporary
  Chromium-family profile, waits for Astra Deck's `background.js` service
  worker, opens `chrome-extension://<id>/popup.html`, seeds
  `ytSuiteSettings` with optional enrichment features enabled, and validates:
  - the popup has extension storage and permissions APIs;
  - the staged manifest declares all runtime optional enrichment origins;
  - a fresh profile has not already granted those origins;
  - the Grant access banner is visible and enabled;
  - the banner text lists all five optional origins;
  - at least one permission-needed badge renders in the popup UI.
- The default smoke does not click the native permission prompt. `--headed
  --attempt-grant` exists for a human release-smoke pass where the operator can
  accept the browser prompt.

## Verification

- `npm run smoke:optional-hosts`
- `node --test tests/optional-host-smoke.test.js`

## Remaining Work

- Run a headed Chrome or Edge manual smoke before release for prompt acceptance,
  denial, revocation, and default-on SponsorBlock behavior. Chrome itself may
  need a non-managed install or policy change before it can load unpacked
  extensions on this PC.
