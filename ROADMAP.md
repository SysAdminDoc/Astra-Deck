# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — Finish the 2026-09-28 audit sweep
  Why: the pass covered the watch-page monolith features it touched, background, popup, side
  panel, Subscription Groups, Video Hider, Digital Wellbeing, Download UI, Video Notes and
  Studio Comments. Not yet read with the same care: `features/dearrow`, `element-zapper`,
  `player-dock`, `return-dislike`, `search-hygiene`, `sponsorblock`, `subtitles`,
  `video-insights`, `live-chat`, `sticky-chat`, `subscription-view`, and `extension/core/*`
  beyond heatmap, chapters and settings-schema.
  Where: the modules above.
  Acceptance: each module read for lifecycle symmetry, late async work after destroy, outside
  text in templates and unbound guards, with findings fixed or logged here.
  Complexity: L
  Note (2026-10-10 research): fixes landed in `features/dearrow` (1ab5cdc0, 7705066b),
  `features/return-dislike` (54094a4f) and `features/player-dock` (b0f4565f) on 2026-10-09;
  confirm those three count as read before starting on the rest.

## Research-Driven Additions

Added 2026-10-10 from `RESEARCH.md`. Evidence and rejected alternatives live there.

- [ ] P0 — Restore the classic watch layout when YouTube's 2026-10 side-rail test is on
  Why: since about 2026-10-07 YouTube moves comments and the description into a right-hand
  panel with a recommendation grid under the player and drops the theater button. Undoing
  redesigns is Astra's first persona, Chrome users can't run the uBlock Origin scriptlets
  that revert it, and nothing in `extension/` names the test's flags, `#fixed-side-menu` or
  `ytd-watch-grid`, while 42 rules in `ytkit.js` and 25 across modules key on
  `ytd-watch-flexy`.
  Evidence: Ubergizmo 2026-10-07 and Techdows 2026-10-08 (flag list); Control Panel #343
  (2026-10-07) and its page.js `hideWatchSideMenu`
  (`ytd-watch-flexy { --ytd-watch-flexy-fixed-side-menu-width: 0 }` plus `#fixed-side-menu`)
  and `ytd-watch-grid` query (page.js:3697); davidluttrull/youtube-classic-watch-layout (MIT,
  2026-10-07) sets `ytcfg.get('EXPERIMENT_FLAGS')` and `yt.config_.EXPERIMENT_FLAGS` entries
  false, flips `isTwoColumns_`, `splitScroll` and `sideRailDismissiblePanels` on the live
  `ytd-watch-flexy`, and re-applies on navigation; r/youtube 1wzvguw, 1wxerdp, 1x1nloc.
  Touches: `extension/ytkit-main.js` (a document_start override beside `installFeedPrefilter`,
  gated by a bridge attribute, applied before `ytcfg.set` and again on `yt-navigate-finish`),
  `extension/core/settings-schema.js` (`restoreClassicWatchLayout`, default off, plus
  `watchLayoutFlagOverrides` as an editable string seeded with
  `web_watch_eligible_to_switch_to_grid, web_watch_enable_single_column_grid_view,
  web_fixed_panel_watch_next_grid_swap, web_live_chat_panel_watch_next_grid_swap,
  web_watch_fixed_default_panels, web_engagement_panel_show_description,
  web_watch_move_summary_to_sd, web_watch_hero_list, web_watch_split_scroll,
  web_side_rail_dismissible_panels, kevlar_watch_hide_comments_while_panel_open,
  kevlar_watch_cinematics, disable_theater_mode`), `extension/early.css` or
  `core/selector-packs/watch.js` (`#fixed-side-menu` hide and a `ytd-watch-grid` alias for
  every watch-scoped selector), the Theater Split and Player Dock placement guards, 11
  locales, README settings table, `sync-userscript.js` picks the MAIN bundle up as is.
  Acceptance: with the setting on, a vm fixture whose `ytcfg` carries the listed flags true
  sees every flag false before a page script reads them, and a simulated
  `yt-navigate-finish` leaves `ytd-watch-flexy` with `isTwoColumns_` true and `splitScroll`
  and `sideRailDismissiblePanels` false; with it off nothing is touched; `#fixed-side-menu`
  is hidden by CSS; a schema test pins the seeded flag list and accepts a user-added flag;
  `tests/helpers/source.js` `userscriptBundles` shows the override in the page-world bundle;
  the owed live check (a forced-flag or enrolled session) shows comments under the player.
  Complexity: L

- [ ] P1 — Hide the Shorts grid shelves YouTube introduced in search and feeds around 2026-10-09
  Why: YouTube now renders Shorts shelves as `grid-shelf-view-model`, which Remove All
  Shorts (`ytd-reel-shelf-renderer`, `ytd-rich-shelf-renderer[is-shorts]`) and the
  `shortsShelf` selector pack don't name, so Shorts come back for everyone who hid them.
  Evidence: Remove YouTube Suggestions commits 2dca2940 ("Fix hiding shorts from search
  results", `#container.ytd-search grid-shelf-view-model.ytGridShelfViewModelHost.ytd-item-section-renderer`)
  and 436b0fd8 ("also hide grid shelves without a bottom button", the same host without the
  search scope), both 2026-10-09, released as v4.4.0; `grep grid-shelf-view-model extension/`
  returns nothing on 2026-10-10.
  Touches: `extension/early.css:76-77`, `extension/ytkit.js:10897-10898`,
  `extension/core/selector-packs/shortsShelf.js`, `selector-packs.json` (regenerate with
  `npm run generate:selector-asset` and re-sign with `npm run sign:feeds`), a fixture under
  `tests/fixtures/`.
  Acceptance: a fixture with `grid-shelf-view-model.ytGridShelfViewModelHost` shelves inside
  `ytd-item-section-renderer` on a search page and on Home hides the ones that contain
  `ytm-shorts-lockup-view-model` with Remove All Shorts on, leaves a grid shelf without
  Shorts lockups alone, and shows all of them with the setting off; the `shortsShelf` pack
  lists the new host; `tests/selector-asset.test.js` passes with the re-signed asset.
  Complexity: S

- [ ] P1 — Hide AI-generated chapters while keeping creator chapters
  Why: YouTube is adding auto-generated chapters to videos after upload, two Control Panel
  issues asked for a hide, it shipped there on 2026-10-08, and a Greasy Fork script that
  does only this draws about 33 installs a day. Astra's chapter settings (`autoOpenChapters`,
  `autoSkipChapters`, `chapterJumpButtons`, `antiTranslateChapters`) can't tell the two apart.
  Evidence: Control Panel #342 (2026-09-30), #344 (2026-10-07), commit beb487b3 (2026-10-08)
  `removeAutoChapters` in page.js: drops `multiMarkersPlayerBarRenderer.markersMap` entries
  with `key == 'AUTO_CHAPTERS'` and a matching `visibleOnLoad`, `loadMarkersCommand`
  `entityKeys`/`visibleOnLoadKeys` whose base64url decodes to contain `AUTO_CHAPTERS`,
  `entityBatchUpdate.mutations` by the same test, and the engagement panel
  `engagement-panel-macro-markers-auto-chapters` with its chip and description card, on
  `next`, `get_watch` and `ytInitialData`; Greasy Fork script 598706 (updated 2026-10-08).
  Touches: `extension/ytkit-main.js` (register on the existing `JSON.parse` hook in
  `installFeedPrefilter` and the `ytInitialData` path next to the `ytInitialPlayerResponse`
  definition at ~583), a new `extension/core/auto-chapters.js` decision module in the
  `core/feed-prefilter.js` style (seven-edit core-module checklist in CLAUDE.md, plus
  `V5_BUNDLE_MODULES` in `sync-userscript.js`), `extension/core/settings-schema.js`
  (`hideAutoChapters`, default off), `extension/core/heatmap.js:85-88` (its `markersMap`
  reader must still find the heatmap entry), 11 locales, README settings table.
  Acceptance: a captured `next` response with `AUTO_CHAPTERS` markers and the auto-chapters
  panel comes out with no auto marker, no panel, no chip and no player-bar action button,
  while a response with only creator chapters is returned unchanged; heatmap tests pass with
  the filter on; a positive control that drops the key test fails the fixture; the setting
  is off by default and the userscript bundle carries the module.
  Complexity: M

- [ ] P2 — Add the seven 2026-10-09 fixes to CHANGELOG Unreleased
  Why: the last CHANGELOG edit was 17:52 on 2026-10-09 and seven fix commits landed between
  17:54 and 18:08: player-dock `b0f4565f` (dock no longer attaches to the hover preview),
  DeArrow `1ab5cdc0` and `7705066b`, Return YouTube Dislike `54094a4f`, sync `69e50bbc` and
  `b7f6badb`, settings `f14c4a76`. The release-notes script publishes the section verbatim,
  so the next release would hide them.
  Evidence: `git log -8 --format='%ci %s'` against `git log -1 --format=%ci -- CHANGELOG.md`
  on 2026-10-10.
  Touches: `CHANGELOG.md` `## [Unreleased]` `### Fixed`.
  Acceptance: each of the seven commits has a user-facing bullet in Unreleased in the house
  voice, and `tests/release-currency.test.js` passes.
  Complexity: S

- [ ] P2 — Translate the 29 English toasts left in `ytkit.js` and stop the copy gate from grandfathering them
  Why: the 2026-10-09 CHANGELOG says every language is fully translated, but
  `showToast('Playlist reversed')` (16525), 'Sleep timer elapsed. Playback paused.' (17494),
  'A-B Loop cleared' (17795), 'No video found' (18822), 'Video popped out' (18890),
  'PiP not supported' (18919) and 23 more reach users in English in all 11 locales.
  `scripts/check-localizable-ui-copy.js` counts `showToast` as a sink (line 43) but a
  whole-file baseline keeps legacy hits out of the count; `extension/features/` has none.
  Evidence: `grep -c "showToast('[A-Z]" extension/ytkit.js` = 29 on 2026-10-10;
  `docs/i18n-coverage.md` counts catalogue keys, not sinks.
  Touches: `extension/ytkit.js` (wrap each in `t()`), `extension/_locales/*/messages.json`
  (11), the copy-gate baseline (`node scripts/check-localizable-ui-copy.js --update-baseline`
  after the count drops), `scripts/i18n-placeholder-baseline.json`,
  `tests/i18n-plural-keys.test.js` for any count form.
  Acceptance: zero capitalised English `showToast('…')` literals in `extension/ytkit.js`,
  every new key present in all 11 catalogues, and `npm run i18n:copy:gate` fails when one
  is reintroduced because the baseline now sits at the new count.
  Complexity: M

- [ ] P2 — Serve the userscript libraries from jsDelivr's commit-pinned GitHub mirror
  Why: Greasy Fork accepts `@require` and `@resource` only from its recognized CDN list.
  `raw.githubusercontent.com` isn't on it; jsDelivr's
  `cdn.jsdelivr.net/gh/<owner>/<repo>@<40-hex-sha>/<path>` form is, and SRI in Tampermonkey
  format is allowed. Astra's three libraries and the locale resources point at
  `raw.githubusercontent.com/.../refs/tags/v<version>/...` (`sync-userscript.js:59-64`),
  which is the code-side half of the blocked Greasy Fork listing (Roadmap_Blocked P2,
  2026-08-11). A commit pin is immutable on its own; the `#sha256=` suffix stays as the
  second check.
  Evidence: https://greasyfork.org/en/help/cdns (pattern
  `^(https?:)?//(cdn|test1|testingcf|fastly|gcore).jsdelivr.net/gh/[^/]+/[^/@]+@[a-f0-9]{40}`);
  https://greasyfork.org/en/help/external-scripts.
  Touches: `sync-userscript.js` (`LIBRARY_URL_BASE`, the URL builder at :64 and the
  `git show refs/tags/...` input at :99), `build-extension.js` `--bump`,
  `scripts/check-userscript-drift.js`, the release order in CLAUDE.md (the loader names the
  SHA of the commit that holds the libraries, so the records are rewritten in the commit
  after the tag), tests that assert the URL shape, README userscript section.
  Acceptance: `YTKit.user.js` `@require` and `@resource` lines use the jsDelivr `/gh/` form
  with a 40-hex commit and the `#sha256=` suffix kept; a drift test fails on any
  `raw.githubusercontent.com` library URL; the release recipe's `curl` check lists the
  jsDelivr URLs and each serves the pinned bytes after the next tag.
  Complexity: M

- [ ] P2 — Import subscriptions from Google Takeout and NewPipe into Subscription Groups
  Why: Subscription Groups imports only its own JSON and OPML
  (`extension/features/subscription-groups/index.js` ~622, picker `accept`
  `.json,.opml,.xml`), while FreeTube, NewPipe, Invidious and Piped users carry Takeout
  `subscriptions.csv` or JSON, or NewPipe JSON. FilterTube's two newest bug reports (#79,
  #80) are both import-path failures, which is where migrating users land. Astra already
  imports Takeout watch history (`settingsManager.importYouTubeTakeoutWatchHistory`,
  settings-panel ~4315).
  Evidence: FreeTube `DataSettings.vue` import matrix (Takeout CSV columns `Channel Id`,
  `Channel Url`, `Channel Title`; Takeout JSON `snippet.resourceId.channelId` and
  `snippet.title`; NewPipe JSON top-level `subscriptions[]` with `url`, `name`,
  `service_id`); FilterTube #79 and #80 (2026-10).
  Touches: `extension/features/subscription-groups/index.js` (`_importGroups*` family and
  the picker), the `csvCell` helper's parsing counterpart in `extension/core/`, settings-panel
  import copy, 11 locales, `tests/features/subscription-groups*.test.js` with three fixtures.
  Acceptance: importing a Takeout `subscriptions.csv`, a Takeout JSON and a NewPipe JSON
  each lands every channel in a chosen or new group with the undo toast, a malformed file
  gives the `describeFailure` copy, channel ids are normalized through
  `normalizeBlockedChannelId`'s rules, and the three fixtures are unit-tested.
  Complexity: M

- [ ] P2 — Show views on their own line on Home and Subscriptions cards
  Why: since about 2026-09-25 YouTube puts the channel name, views and age on one row behind
  an eye icon, so long channel names truncate the numbers. Two trackers asked and Control
  Panel shipped an option on 2026-10-10. Astra reads the row for its filters but offers no
  way to show the numbers.
  Evidence: Control Panel #340 (2026-09-25) and commit 35c57575 (2026-10-10):
  `ytd-browse:is([page-subtype="home"],[page-subtype="subscriptions"]) ytd-rich-item-renderer:not([is-slim-media]) .ytContentMetadataViewModelMetadataRow:has(> .ytContentMetadataViewModelLeadingIcon) { display: block !important; white-space: nowrap; overflow: hidden }`
  plus hiding the verified icon in that row; ImprovedTube #4361 (2026-09-27).
  Touches: `extension/features/home-subs-css/index.js`, `extension/core/settings-schema.js`
  (`viewsOnSeparateLine`, feed category, default off), 11 locales, README settings table
  via `npm run generate:settings-reference`.
  Acceptance: with the setting on, the 2026-09 lockup fixture renders the views row as a
  block below the channel row with the verified icon hidden; off leaves YouTube's layout;
  the i18n gates pass for the new strings.
  Complexity: S

- [ ] P2 — Take the DeArrow Voting toggle off the panel until its write contract is verified
  Why: `deArrowVoting` (`settings-schema.js:736`, `ytkit.js` ~36454) posts to
  `https://sponsor.ajay.app/api/branding/vote/${type}` (~36499), a route that doesn't exist,
  so every vote fails silently. The fix is blocked because testing a write touches DeArrow's
  live data (Roadmap_Blocked L359). A visible toggle that can't work costs trust for nothing.
  Evidence: the lines above and Roadmap_Blocked.md:359, read 2026-10-10.
  Touches: `extension/core/settings-schema.js` (move the key to `RETIRED_SHIPPED_IDS` with
  the migration note, or mark it `internal`), the settings-panel card list, README settings
  table, `scripts/monolith-peel-baseline.json`, CHANGELOG, the Roadmap_Blocked item (note
  the toggle is hidden).
  Acceptance: the Voting card no longer renders in the panel or the popup overview, a stored
  `true` is dropped on load without an error, the retired-id tests pass, and the blocked item
  records the change.
  Complexity: S

- [ ] P3 — List view for Home, search and channel grids
  Why: a list layout is ImprovedTube's most-reacted open request (19) and Control Panel
  ships "grid as list" (`gridAsListPageSelector` in page.js); `subscriptionViewMode` offers
  list and compact on Subscriptions only (`settings-schema.js:130`).
  Evidence: https://github.com/code-charity/youtube/issues/3593; Control Panel page.js
  ~2620-2650 (`yt-lockup-metadata-view-model { display: grid }` under the list selector).
  Touches: `extension/features/subscription-view/index.js`, `extension/core/settings-schema.js`
  (widen `subscriptionViewMode`'s scope or add `feedViewMode`),
  `extension/features/home-subs-css/index.js`, 11 locales.
  Acceptance: with list mode on, Home, search and channel `/videos` grids render one card
  per row with the thumbnail left and metadata right on the 2026-09 lockup fixture, the
  filters and the quick-hide X still attach, and the 320 px `smoke:a11y` lane shows no
  overflow (owed check).
  Complexity: M

- [ ] P3 — Fix the stale developer docs and extend the doc-truth gate to catch them
  Why: `SOURCE-README.md:67` says `.nvmrc` pins Node 22 (it holds 24),
  `docs/hosted-policy-closure.md:36` and `:77` call v4.46.0 the latest public release,
  `CONTRIBUTING.md:100-101` tells contributors to edit a `features` array and
  `settingsManager.defaults` that the schema replaced, `.github/ISSUE_TEMPLATE/bug_report.md`
  examples name Firefox 122 (below the 142 floor) and 4.47.0, and `INSTALL.md` omits the
  chromium-store profile the README ships. `scripts/check-versions.js`
  `ACTIVE_DOC_TRUTH_FILES` (:32-38) doesn't cover those files, so the "Latest public release"
  claim passed the gate.
  Evidence: the lines above, read 2026-10-10.
  Touches: those five files, `scripts/check-versions.js` (add `docs/hosted-policy-closure.md`,
  `SOURCE-README.md`, `INSTALL.md` and `CONTRIBUTING.md` to the retired-reference scan),
  `tests/release-currency.test.js`.
  Acceptance: each stale line is corrected, the gate list includes the four docs, and a test
  proves a planted "Latest public release `v4.46.0`" line in `docs/hosted-policy-closure.md`
  fails `npm run check:versions`.
  Complexity: S

- [ ] P3 — Add `.github/FUNDING.yml` so the repo shows its Sponsor button
  Why: the README carries a Ko-fi button (afa5f498, 2026-09-13), but GitHub renders the
  Sponsor button only from a FUNDING.yml, and the repo has never had one.
  Evidence: `.github/` listing on 2026-10-10; GitHub docs "Displaying a sponsor button in
  your repository".
  Touches: `.github/FUNDING.yml` (`ko_fi: X8K126YVER`, the slug at README line 21),
  `tests/hardening.test.js` if it pins `.github` contents.
  Acceptance: the file exists with the README's slug and the repo page shows the Sponsor
  button.
  Complexity: S

- [ ] P3 — Submit Astra Deck to Lissy93/awesome-privacy's Browser Extensions section
  Why: that list (9,942 stars, pushed 2026-10-10) carries SponsorBlock and DeArrow side by
  side, accepts own-project submissions, and Astra meets its bar: open source, no telemetry,
  repo since 2025-07-12 and first release 2026-02-20 (both past the four-month rule), a
  stable release line. The 2026-10-05 pass rejected pluja's list, which is a different list
  with no extension section.
  Evidence: https://github.com/Lissy93/awesome-privacy/blob/main/.github/CONTRIBUTING.md;
  `gh api repos/SysAdminDoc/Astra-Deck` and `gh release list` on 2026-10-10.
  Touches: a fork and a pull request editing `awesome-privacy.yml` only; nothing in this repo.
  Acceptance: a pull request is open with an entry in the file's schema, written in the
  maintainer's voice, naming the local-first design and the signed feeds.
  Complexity: S

- [ ] P3 — Bump `ws` to 8.22.0
  Why: the only outdated direct dependency on 2026-10-10 (`npm outdated`: 8.21.3 to 8.22.0);
  the dev audit is clean, so this is currency only.
  Evidence: `npm outdated --json` in the repo on 2026-10-10.
  Touches: `package.json`, `package-lock.json`.
  Acceptance: `npm ls ws` shows 8.22.0 and the `deps` gate stays green.
  Complexity: S
