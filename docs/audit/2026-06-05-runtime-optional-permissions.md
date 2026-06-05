# Runtime Optional Permissions Audit - 2026-06-05

## Scope

- `build-extension.js`
- `extension/core/data-flow.js`
- `extension/core/optional-host-permissions.js`
- `extension/popup.html`
- `extension/popup.js`
- `extension/background.js`
- `YTKit.user.js`
- `tests/background.test.js`
- `tests/hardening.test.js`
- `docs/store-permission-rationale.md`
- `docs/cws-submission-checklist.md`

## Finding

Store-safe artifacts granted every public enrichment API host at install time.
That included hosts for default-off features such as thumbnail upgrade/download,
Return YouTube Dislike, and Reddit discussions. Chrome and Mozilla both support
Manifest V3 `optional_host_permissions`, and runtime permission requests are a
better fit for those default-off enrichment features.

`sponsor.ajay.app` needed a dedicated gesture path because SponsorBlock is
default-on and shares the origin with DeArrow. A later same-day slice added the
popup Grant access banner, so the store-safe package can move that shared host
to `optional_host_permissions` without silently prompting or silently breaking
the default SponsorBlock path.

## Fix

- Added `hostGrant: "runtime-optional"` metadata for `sponsor.ajay.app`,
  `i.ytimg.com`, `returnyoutubedislikeapi.com`, and Reddit entries in the
  data-flow catalogue.
- Updated build-profile generation so store-safe artifacts keep core YouTube
  hosts in `host_permissions`, move enrichment hosts to
  `optional_host_permissions`, and keep all eligible optional hosts in
  `content_security_policy.extension_pages` `connect-src`.
- Added `extension/core/optional-host-permissions.js`, a small callback/promise
  compatible wrapper around the browser permissions API.
- Wired popup setting writes to request declared optional host permissions
  before persisting a matching setting as enabled.
- Added a background `EXT_FETCH` gate so generated runtime-optional origins
  still pass the existing allowlist but are rejected before network fetch when
  the matching optional host grant is missing or revoked.
- Added popup denied/revoked grant-state chips, `permissions.onAdded` /
  `permissions.onRemoved` refresh, data-flow grant labels, and exact
  permission-denied status copy.
- Added a popup Grant access banner that requests all currently missing
  optional host grants from an explicit user gesture, covering default-on
  SponsorBlock after `sponsor.ajay.app` moved to runtime optional grants.
- Regenerated `YTKit.user.js` so the bundled data-flow module stays in sync.
- Updated hardening tests and store-review docs for the split.

## Verification

- `node sync-userscript.js`.
- `node --test tests/hardening.test.js --test-name-pattern="optional host|build-extension emits|data-flow|Return YouTube Dislike"`.
- `node --test tests/background.test.js`.
- `node --test tests/hardening.test.js --test-name-pattern="popup.js requests declared optional hosts|optional host"`.
- `node --test tests/hardening.test.js --test-name-pattern="optional host|build-extension emits|data-flow generated|SponsorBlock and DeArrow"`.

## Remaining Work

- `npm run smoke:optional-hosts` now covers Chromium pre-grant prompt readiness
  in a fresh store-safe profile. Run headed Chrome/Edge and Firefox store-safe
  smoke checks for native prompt acceptance, granted behavior, denial,
  revocation, and the default-on SponsorBlock Grant access banner.
