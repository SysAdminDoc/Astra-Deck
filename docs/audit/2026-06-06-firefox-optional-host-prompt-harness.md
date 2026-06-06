# Firefox Optional Host Prompt Harness - 2026-06-06

## Scope

- `scripts/smoke-firefox-webext.js`
- `tests/firefox-injection-audit.test.js`
- Store-safe Firefox `web-ext run` release smoke

## Finding

The Firefox smoke only covered clean startup through `web-ext run` in headless
mode. That is useful for AMO packaging and background startup, but it cannot
exercise the runtime optional-host prompt because the permission doorhanger is a
headed browser surface.

Firefox uses a per-installation internal UUID for `moz-extension://` pages. The
manual prompt harness therefore needs a stable UUID mapping for the staged
extension so the popup URL can be opened directly during a release run.

## Fix

- Added `--headed` to `scripts/smoke-firefox-webext.js` so release operators
  can run Firefox without `--arg=-headless`.
- Added `--manual-optional-hosts`, which:
  - requires headed Firefox;
  - extends the default timeout to three minutes unless overridden;
  - maps `ytkit@sysadmindoc.github.io` to a stable internal UUID with
    `extensions.webextensions.uuids`;
  - opens the staged popup at
    `moz-extension://2f88b30c-68f9-4f4d-8c0e-e71f33a58a01/popup.html`;
  - opens the normal YouTube smoke URL in the same run;
  - prints the expected `optional_host_permissions` origins and the
    accept/deny/revoke operator checklist.
- Added tests for argument parsing, stable popup URL construction, UUID-pref
  wiring, headed-only enforcement, and preservation of the existing headless CI
  smoke shape.

## Verification

- `node --check scripts/smoke-firefox-webext.js`
- `node --test tests/firefox-injection-audit.test.js`
- `npm run smoke:firefox` was attempted and failed before launch because this
  machine has no Firefox executable on the searched paths. No native Firefox
  prompt result is claimed for this cycle.
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Release Command

```powershell
npm run smoke:firefox -- --firefox "C:\Program Files\Mozilla Firefox\firefox.exe" --headed --manual-optional-hosts
```

Run the command with a local Firefox install, accept the first prompt, rerun
with a fresh temporary profile and deny the prompt, then revoke the accepted
site permissions and confirm the popup returns to the Grant access state.
