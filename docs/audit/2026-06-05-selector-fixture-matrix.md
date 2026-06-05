# Selector fixture matrix expansion - 2026-06-05

## Scope

- `scripts/build-selector-fixtures.js`
- `tests/fixtures/selector-surface-matches.json`
- `tests/selector-regression.test.js`
- Existing local MHTML captures:
  - `mhtml/YouTube.mhtml`
  - `mhtml/WatchPage.mhtml`
  - `mhtml/LiveChat.mhtml`

## Finding

The selector fixture harness parsed the existing home, watch, and live-chat
captures, but its DOM-subset match report only covered `playerChrome` and
`liveChat`. Several selector packs already had usable evidence in the committed
captures, while broader capture-week surfaces such as Shorts, channel, history,
watch-later, embed player, and notifications-menu still need dedicated raw
MHTML files.

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

## Verification

- `npm run build:fixtures`
- `node --test tests/selector-regression.test.js`

Generated match evidence:

- Home capture: `appShell`, `feed`, `feedCard`, `leftNav`, `media`, `nav`,
  `notifications`, `search`, `shortsShelf`, `thumbnail`
- Watch capture: `mainVideo`, `player`, `playerChrome`, `playerSettings`
- Live-chat capture: `liveChat`

Remaining capture-week work:

- Add dedicated raw captures for Shorts, search results, channel, history,
  watch later, embed player, and the open notifications menu.
- Promote `profile` / `channelProfile`, `sidebar`, `relatedSidebar`, and
  `watch` only when a capture proves their stable selector chains.
