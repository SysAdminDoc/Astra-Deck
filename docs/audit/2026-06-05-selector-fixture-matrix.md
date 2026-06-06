# Selector fixture matrix expansion - 2026-06-05

## Scope

- `scripts/build-selector-fixtures.js`
- `tests/fixtures/selector-surface-matches.json`
- `tests/selector-regression.test.js`
- Existing local MHTML captures:
  - `mhtml/YouTube.mhtml`
  - `mhtml/WatchPage.mhtml`
  - `mhtml/LiveChat.mhtml`
- New local MHTML captures from this pass:
  - `mhtml/Shorts.mhtml`
  - `mhtml/SearchResults.mhtml`
  - `mhtml/Channel.mhtml`
  - `mhtml/EmbedPlayer.mhtml`

## Finding

The selector fixture harness first parsed the existing home, watch, and
live-chat captures, but its DOM-subset match report only covered `playerChrome`
and `liveChat`. Several selector packs already had usable evidence in the
committed captures. A second pass captured public Shorts, search-results,
channel, and embed-player surfaces through the Chrome DevTools helper; history,
watch-later, and open-notifications remain account/menu-state bounded in this
automation profile.

## Fix

- Expanded `SURFACE_MATCH_SOURCES` to cover 15 proven surfaces from the existing
  captures: `appShell`, `feed`, `feedCard`, `leftNav`, `media`, `nav`,
  `notifications`, `search`, `shortsShelf`, `thumbnail`, `mainVideo`, `player`,
  `playerChrome`, `playerSettings`, and `liveChat`.
- Kept `profile` / `channelProfile`, `sidebar`, `relatedSidebar`, and `watch`
  out of the generated report because the current decoded watch capture does
  not prove a stable selector match for those packs.
- Added attribute selector operator support to the dependency-free DOM subset
  matcher so selectors such as `a[href^="/shorts"]` are interpreted correctly.
- Updated selector regression coverage so expected surfaces come from the
  builder, stable/fallback arrays stay synced with live packs, and each
  registered surface must have at least one matched stable selector.
- Added `npm run capture:surface` profiles for `shorts`, `search`, `channel`,
  and `embed`, then regenerated committed token fixtures for the new raw local
  captures.
- Added multi-capture match IDs so the same selector pack can be proven against
  more than one MHTML file without pretending the capture surface is a distinct
  runtime selector surface.
- Promoted the capture-backed parts of the matrix only when the generated
  fixture proved stable selector matches. `channel.feed`, `embed.playerChrome`,
  and `embed.playerSettings` stayed out because the current captures do not
  prove stable matches for those packs.

## Verification

- `npm run build:fixtures`
- `node --test tests/selector-regression.test.js`

Generated match evidence:

- Home capture: `appShell`, `feed`, `feedCard`, `leftNav`, `media`, `nav`,
  `notifications`, `search`, `shortsShelf`, `thumbnail`
- Watch capture: `mainVideo`, `player`, `playerChrome`, `playerSettings`
- Live-chat capture: `liveChat`
- Shorts capture: `shorts.shortsShelf`, `shorts.media`, `shorts.thumbnail`
- Search-results capture: `searchResults.search`, `searchResults.feedCard`,
  `searchResults.thumbnail`, `searchResults.nav`
- Channel capture: `channel.profile`, `channel.channelProfile`,
  `channel.feedCard`, `channel.thumbnail`
- Embed-player capture: `embed.player`, `embed.mainVideo`

Remaining capture-week work:

- Add account-authenticated raw captures for history and watch later. The
  unauthenticated probes settled on `ytd-app` but did not expose the required
  feed, playlist, or video-card selectors.
- Add an open-notifications-menu capture. The current helper captures loaded
  pages, not the clicked topbar menu state.
- Promote `channel.feed`, `embed.playerChrome`, `embed.playerSettings`,
  `sidebar`, `relatedSidebar`, and `watch` only when a capture proves their
  stable selector chains.
