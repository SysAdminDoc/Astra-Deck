# Background Optional Host Fetch Audit - 2026-06-05

## Scope

- `extension/background.js`
- `tests/background.test.js`
- Optional host-permission planning docs

## Finding

Cycle 10 moved default-off store-safe enrichment hosts into generated
`optional_host_permissions` and added popup request UX, but the background
`EXT_FETCH` proxy still treated those origins as allowlist-only. Browser fetch
permission failures would have stopped ungranted requests eventually, but the
service worker did not explicitly enforce the runtime grant state before
building headers, credentials mode, timeout state, and the network fetch.

## Fix

- Added manifest-derived optional-host matching in `extension/background.js`.
- Kept the existing `ALLOWED_FETCH_ORIGINS` SSRF guard as the first origin gate.
- Added a `chrome.permissions.contains({ origins })` check for URLs whose
  origin matches a generated optional host permission.
- Rejected missing or revoked optional grants before calling `fetch()`.
- Left required hosts and github-full required hosts on their existing path.

## Verification

- `node --test tests/background.test.js`
- `node --test tests/hardening.test.js --test-name-pattern="EXT_FETCH|optional host|build-extension emits|data-flow|Return YouTube Dislike"`
- `npm run lint -- extension/background.js`
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Remaining Work

- Add SponsorBlock/DeArrow runtime-grant UX before moving
  `sponsor.ajay.app` out of install-time store-safe host permissions.
- Surface optional-host denied/revoked state in settings and data-flow UI.
- Run manual unpacked Chrome and Firefox store-safe smoke checks for prompt,
  grant, denial, and revocation behavior.
