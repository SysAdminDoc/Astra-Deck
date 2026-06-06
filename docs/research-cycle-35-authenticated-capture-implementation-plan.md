# Research Cycle 35 - Authenticated Capture Implementation Plan

Date: 2026-06-06

## Research Area

Implementation-ready plan for the authenticated and menu-state selector capture
lane covering YouTube History, Watch Later, and the opened notifications menu.

## Local Files Reviewed

- `scripts/capture-watch-mhtml.js`
- `scripts/build-selector-fixtures.js`
- `tests/selector-regression.test.js`
- `docs/selector-fixture-workflow.md`
- `.gitignore`
- `package.json`
- `extension/core/selector-packs/notifications.js`
- `extension/core/selector-packs/feed.js`
- `extension/core/selector-packs/feedCard.js`
- `extension/core/selector-packs/leftNav.js`
- `ROADMAP.md`
- `AUTONOMOUS-LOOP-STATE.md`
- `RESEARCH_REPORT.md`

## External Sources

- Chrome DevTools Protocol `Page.captureSnapshot`:
  `https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureSnapshot`
  - The command returns a page snapshot string. For MHTML, the serialized data
    includes iframes, shadow DOM, external resources, and element inline styles.
- Playwright authentication:
  `https://playwright.dev/docs/auth`
  - Authenticated browser state is commonly stored on disk for reuse, but the
    state can contain cookies or headers that impersonate the account and should
    not be checked into a private or public repository.

## Findings

- `scripts/capture-watch-mhtml.js` currently exposes public `watch`, `search`,
  `shorts`, `channel`, and `embed` profiles. It always creates a temporary
  Chrome profile under the OS temp directory and deletes it by default. There
  is no caller-supplied `--user-data-dir`, no authenticated surface profile, and
  no notification-menu opener.
- `scripts/build-selector-fixtures.js` only registers raw MHTML sources for
  home, watch, live chat, Shorts, search results, channel, and embed player.
  `SURFACE_MATCH_SOURCES` does not include `history.*`, `watchLater.*`, or
  `notifications.menu` capture IDs, so `tests/selector-regression.test.js`
  cannot yet require stable selector matches for those surfaces.
- `.gitignore` already blocks raw `*.mhtml`, but it does not explicitly list
  `playwright/.auth/`, `.auth/`, local capture profile directories, or
  storage-state JSON. The first implementation slice should add those ignore
  guards before any auth workflow is documented.
- `extension/core/selector-packs/notifications.js` includes
  `ytd-notification-renderer` as a stable selector, but current regression
  coverage only proves the topbar/badge selectors from the home capture. It
  still needs an opened-menu MHTML before the notification row selector can be
  treated as capture-proven.
- History and Watch Later should reuse existing `feed`, `feedCard`,
  `thumbnail`, `leftNav`, and `appShell` packs rather than introducing new
  selector surfaces unless the captures prove YouTube uses a distinct root.

## Implementation Contract

### Capture CLI

Prefer a persistent Chrome profile directory because the current helper is a
raw Chrome DevTools Protocol script, not a Playwright test runner. A
Playwright-style storage-state path should remain a later migration option only
if the helper moves to Playwright-managed browser contexts.

Add:

```powershell
npm run capture:surface -- --surface history --user-data-dir <absolute external profile path>
npm run capture:surface -- --surface watch-later --user-data-dir <absolute external profile path>
npm run capture:surface -- --surface notifications --user-data-dir <absolute external profile path>
```

Supported aliases:

- `--user-data-dir <path>`
- `ASTRA_CAPTURE_PROFILE_DIR=<path>` as the environment fallback

Rules:

- Require an absolute external profile path for `history`, `watch-later`, and
  `notifications`.
- Reject profile paths equal to or under the repo root, including
  `playwright/.auth`, `.auth`, `mhtml`, `tests/fixtures`, and `.git`.
- Do not print the profile path in successful JSON output.
- Keep the existing temporary-profile behavior for public surfaces.
- Keep `--keep-profile` limited to temporary profiles; external profiles are
  never deleted by the helper.

### Surface Profiles

Add profiles:

- `history`
  - URL: `https://www.youtube.com/feed/history`
  - Output: `mhtml/History.mhtml`
  - Wait selectors: `ytd-app`, `ytd-browse`,
    `ytd-rich-grid-renderer, ytd-video-renderer, yt-lockup-view-model,
    ytd-item-section-renderer`
  - Auth/content proof: at least one feed or video-card selector must match.
    Redirects to `accounts.google.com`, YouTube sign-in prompts, or a generic
    `ytd-app` shell must fail with `auth required for history capture`.
- `watch-later`
  - URL: `https://www.youtube.com/playlist?list=WL`
  - Output: `mhtml/WatchLater.mhtml`
  - Wait selectors: `ytd-app`,
    `ytd-browse, ytd-playlist-video-list-renderer`,
    `ytd-playlist-video-renderer, ytd-video-renderer, yt-lockup-view-model`
  - Auth/content proof: the account must have at least one Watch Later item.
    Empty lists should fail as `watch-later capture requires a populated list`
    instead of generating an empty-state fixture.
- `notifications`
  - URL: `https://www.youtube.com/`
  - Output: `mhtml/NotificationsMenu.mhtml`
  - Wait selectors before click: `ytd-app`,
    `ytd-notification-topbar-button-renderer`
  - Pre-capture action: click the notification topbar button, then wait for
    `ytd-multi-page-menu-renderer` and `ytd-notification-renderer`.
  - Auth/content proof: a signed-out topbar, missing menu root, or empty
    notification list must fail clearly instead of writing a fixture.

### Fixture Builder And Regression

After a maintainer-local authenticated capture exists, add these registrations
atomically with regenerated committed fixtures:

- `SOURCES`
  - `History.mhtml` -> `yt-history.tokens.txt`
  - `WatchLater.mhtml` -> `yt-watch-later.tokens.txt`
  - `NotificationsMenu.mhtml` -> `yt-notifications-menu.tokens.txt`
- `SURFACE_MATCH_SOURCES`
  - `history.appShell`, `history.feed`, `history.feedCard`,
    `history.thumbnail`
  - `watchLater.feed`, `watchLater.feedCard`, `watchLater.thumbnail`,
    `watchLater.leftNav`
  - `notifications.menu`, `notifications.nav`, `notifications.appShell`

Extend `tests/selector-regression.test.js` required-match assertions only after
the corresponding committed `selector-surface-matches.json` rows prove stable
matches. Candidate required selectors:

- History: `ytd-browse`, `ytd-rich-grid-renderer`,
  `ytd-video-renderer`, `yt-lockup-view-model`,
  `yt-thumbnail-view-model`
- Watch Later: `ytd-playlist-video-list-renderer`,
  `ytd-playlist-video-renderer`, `ytd-video-renderer`,
  `yt-lockup-view-model`, `ytd-guide-renderer`
- Notifications menu: `ytd-multi-page-menu-renderer`,
  `ytd-notification-topbar-button-renderer`,
  `ytd-notification-renderer`, `yt-icon-badge-shape`

Update selector-pack `captureEvidence` and `lastVerified` fields only for packs
that the new match fixture proves. Do not promote `channel.feed`,
`embed.playerChrome`, `embed.playerSettings`, `sidebar`, `relatedSidebar`, or
`watch` as part of this slice.

## Safety And Privacy Acceptance

- Raw `.mhtml` files remain ignored and unstaged.
- Auth state, Chrome profiles, cookies, headers, and storage-state JSON remain
  outside the repo or explicitly ignored.
- The capture helper fails before writing output when auth is missing, the list
  is empty, or the notification menu cannot be opened.
- Derived token fixtures must contain selector/class/id tokens only, not
  account text or notification content.
- `selector-surface-matches.json` must not include text snippets from the
  account surfaces.
- Roadmap/audit notes must record capture date, surface, capture mode
  (`cdp-mhtml` or `dom-mhtml-fallback`), and whether each surface was populated.

## Verification Plan

Source-side checks:

```powershell
node --check scripts/capture-watch-mhtml.js
node --check scripts/build-selector-fixtures.js
node --test tests/selector-regression.test.js
git status --ignored -- mhtml playwright .auth capture-profiles
git diff --check
```

Negative capture checks:

```powershell
npm run capture:surface -- --surface history
npm run capture:surface -- --surface history --user-data-dir .\playwright\.auth
npm run capture:surface -- --surface watch-later --user-data-dir .\.auth
```

Expected: each command exits non-zero, prints a clear safety/auth message, and
does not update `mhtml/History.mhtml` or `mhtml/WatchLater.mhtml`.

Maintainer-local positive check:

```powershell
$env:ASTRA_CAPTURE_PROFILE_DIR = '<absolute external Chrome profile path>'
npm run capture:surface -- --surface history
npm run capture:surface -- --surface watch-later
npm run capture:surface -- --surface notifications
npm run build:fixtures
node --test tests/selector-regression.test.js
git status --ignored -- mhtml playwright .auth capture-profiles
```

Expected: only derived token fixtures, `selector-surface-matches.json`,
selector-pack metadata, docs, and roadmap/audit notes are candidates for commit.

## Roadmap Change

Cycle 35 narrows the existing P2 authenticated/menu-state selector capture lane
to a concrete implementation contract. The next implementation pass can work
the capture helper first, then perform a maintainer-local positive capture run
before promoting selector evidence.

## Next Leads

- Implement the helper safety/CLI slice without adding builder registrations.
- Run negative safety checks in CI/local automation.
- In a maintainer-local browser profile with populated History, Watch Later,
  and notifications, capture the three raw MHTML files and then add builder/test
  registrations atomically with derived fixtures.
