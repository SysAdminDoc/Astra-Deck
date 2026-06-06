# Optional Host Prompt State Smoke - 2026-06-06

## Scope

- `extension/core/optional-host-permissions.js`
- `scripts/smoke-chromium-optional-hosts.js`
- `tests/optional-host-smoke.test.js`
- `tests/hardening.test.js`
- Store-safe Chromium runtime optional-host release smoke

## Finding

The Chromium optional-host smoke proved the pre-grant popup state but still
treated accepted, denied, and revoked native prompt outcomes as one manual note.
That left release operators without a script-level assertion for the two risky
negative states: a user denying the prompt and a user revoking a previously
accepted optional host grant.

Chrome documents runtime optional permissions through the Permissions API,
including user-gesture-bound `permissions.request()`, current-grant checks, and
runtime removal. MDN documents the same WebExtensions runtime request model and
notes that MV3 Firefox host grants should use `optional_host_permissions`.

## Fix

- Added `remove()` to the shared optional-host permission helper so callback and
  promise browser APIs expose the same current-grant, request, remove, and
  listener contract.
- Added headed Chromium smoke modes:
  - `--headed --expect-deny` clicks the popup Grant access button, waits for a
    denied prompt to settle, and requires the Grant access banner plus denied
    host-access status copy to remain visible.
  - `--headed --attempt-grant --revoke-after-grant` accepts the prompt, removes
    the accepted optional hosts through `chrome.permissions.remove()`, and
    requires the popup to return to the permission-needed state.
- Kept the default `npm run smoke:optional-hosts` readiness-only path unchanged
  so it can continue running headless without interacting with the browser
  prompt.
- Added helper-level regression coverage for accepted, denied, and revoked
  prompt states.

## Verification

- `node --check scripts/smoke-chromium-optional-hosts.js`
- `node --check extension/core/optional-host-permissions.js`
- `node --test tests/optional-host-smoke.test.js`
- `node --test tests/hardening.test.js --test-name-pattern "optional host permission helper"`
- `npm run smoke:optional-hosts`
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Remaining Work

- Run the new headed Chromium modes with a release operator before tagging so
  the native browser prompt itself is visually confirmed.
- Add or run the equivalent Firefox headed prompt smoke separately; this slice
  only extends the Chromium CDP helper.
