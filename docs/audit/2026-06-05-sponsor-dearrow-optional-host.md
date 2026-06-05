# SponsorBlock/DeArrow Optional Host Audit - 2026-06-05

## Scope

- `extension/core/data-flow.js`
- `extension/popup.html`
- `extension/popup.js`
- `extension/popup.css`
- `tests/hardening.test.js`
- Store permission documentation

## Finding

After the first optional-host slices, `sponsor.ajay.app` still shipped as a
store-safe install-time host permission because SponsorBlock is default-on and
shares that origin with DeArrow. Moving the host directly to
`optional_host_permissions` would have made first-run SponsorBlock look enabled
while the background fetch proxy rejected its segment requests until a user
performed an explicit permission gesture.

## Fix

- Marked `sponsor.ajay.app` as `hostGrant: "runtime-optional"` in the data-flow
  catalogue, so generated store-safe Chrome and Firefox manifests move the host
  from `host_permissions` to `optional_host_permissions`.
- Kept the existing CSP connect-src coverage so a granted optional host remains
  reachable from extension pages.
- Added a popup Grant access banner for already-enabled features with missing
  runtime optional host grants. The button requests all missing optional origins
  from an explicit user gesture.
- Limited popup missing-grant chips to direct data-flow feature owners so
  SponsorBlock category sub-toggles do not flood the UI with duplicate
  permission-needed chips.
- Updated store-review docs so SponsorBlock/DeArrow, thumbnails, Return
  YouTube Dislike, and Reddit all share the same runtime optional-host model.

## Verification

- `node --check extension/popup.js`
- `node --test tests/hardening.test.js --test-name-pattern="optional host|build-extension emits|data-flow generated|SponsorBlock and DeArrow"`

## Remaining Work

- Run manual unpacked Chrome and Firefox store-safe smoke checks for permission
  prompt, grant, denial, revocation, and default-on SponsorBlock banner behavior.
