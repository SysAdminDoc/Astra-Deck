# Optional Host Permission State UI Audit - 2026-06-05

## Scope

- `extension/popup.js`
- `extension/popup.css`
- `tests/hardening.test.js`
- Optional host-permission planning docs

## Finding

The popup requested runtime optional host permissions before enabling matching
default-off settings, and the background fetch proxy enforced current grants,
but missing grants still looked like generic write failures in the popup. If a
user revoked an optional host grant after enabling a feature, the popup also had
no visible setting or data-flow state showing that the enabled feature could no
longer reach its runtime-optional origin.

## Fix

- Added a popup optional-host grant-state cache keyed by setting and origin.
- Refresh grant state through `permissions.contains()` after setting writes, on
  popup boot, after storage refresh, and from `permissions.onAdded` /
  `permissions.onRemoved`.
- Show a compact permission-needed chip on affected quick-toggle rows and
  schema-overview rows.
- Add granted/permission-needed labels to the optional-host rows in the
  data-flow panel.
- Preserve the exact permission-denied message in popup status instead of
  replacing it with a generic write failure.

## Verification

- `node --check extension/popup.js`
- `node --test tests/hardening.test.js --test-name-pattern="popup.js requests declared optional hosts|optional host"`
- `npm run lint -- extension/popup.js extension/core/optional-host-permissions.js`

## Remaining Work

- `npm run smoke:optional-hosts` now covers Chromium pre-grant banner state in
  a fresh store-safe profile. Run headed Chrome/Edge and Firefox store-safe
  smoke checks for native prompt grant, denial, revocation behavior, and the
  default-on SponsorBlock Grant access banner.
