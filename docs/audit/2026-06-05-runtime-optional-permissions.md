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

`sponsor.ajay.app` is different because SponsorBlock is default-on and shares
the origin with DeArrow. Moving it to optional without a dedicated first-run or
enable-time grant UX would silently break the default SponsorBlock path, so this
cycle left that host required and documented it as remaining work.

## Fix

- Added `hostGrant: "runtime-optional"` metadata for `i.ytimg.com`,
  `returnyoutubedislikeapi.com`, and Reddit entries in the data-flow catalogue.
- Updated build-profile generation so store-safe artifacts keep core YouTube and
  SponsorBlock hosts in `host_permissions`, move the default-off enrichment
  hosts to `optional_host_permissions`, and keep all eligible optional hosts in
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
- Regenerated `YTKit.user.js` so the bundled data-flow module stays in sync.
- Updated hardening tests and store-review docs for the split.

## Verification

- `node sync-userscript.js`.
- `node --test tests/hardening.test.js --test-name-pattern="optional host|build-extension emits|data-flow|Return YouTube Dislike"`.
- `node --test tests/background.test.js`.
- `node --test tests/hardening.test.js --test-name-pattern="popup.js requests declared optional hosts|optional host"`.

## Remaining Work

- Add a SponsorBlock/DeArrow runtime-grant UX before moving
  `sponsor.ajay.app` out of install-time store-safe host permissions.
- Run manual unpacked Chrome and Firefox store-safe smoke checks for permission
  prompts, granted behavior, denial, and revocation.
