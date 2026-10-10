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

- [ ] P2 — Apply the comment features to the comments panel on YouTube's side-panel watch page
  Why: on the 2026-10 side-panel page YouTube hides `ytd-comments#comments` under the video and
  renders comments in `ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]`
  inside `#secondary`, in a `ytd-comments` with no `#comments` id. About 760 selectors are scoped
  to `#comments` (429 in `ytkit.js`, 334 in `features/chat-style-comments/index.js`), so comment
  filters, search, chat-style comments and Theater Split's comment pane miss that panel for anyone
  in the test who leaves Classic Watch Layout off.
  Evidence: `tests/fixtures/watch-side-panel-2026-10.json` (forced-flag capture, 20 of 20 threads
  in the panel, 0 under `#comments`); `tests/watch-side-panel-capture.test.js`.
  Touches: `extension/ytkit.js`, `extension/features/chat-style-comments/index.js`,
  `core/selector-packs/comments.js`, Theater Split's comment source. One shared scope such as
  `:is(ytd-comments#comments, [target-id="engagement-panel-comments-section"] ytd-comments)` keeps
  specificity at the id level, so a mechanical swap is possible but has to be checked rule by rule.
  Acceptance: the capture test gains a thread chain from the panel that the comment filter, comment
  search and chat-style rules match; an enrolled (not forced) session shows the panel on screen with
  Hide Related Videos on, which the forced capture could not (the panel renders off-canvas there).
  Complexity: L

- [ ] P2 — Publish the page-world switches before YouTube's inline data on a hard load
  Why: the isolated world publishes bridge switches from `ytkit.js` at document_idle, after a hard
  load's inline `ytInitialData`, `ytInitialPlayerResponse` and `ytcfg` have been read. Three
  features lose their first page to this: Hide AI Chapters (the first video keeps its AI markers
  on the bar), Force DVR (the first live stream gets no DVR) and Classic Watch Layout (the flags
  are already read, so only the DOM fix-up runs). Every later navigation is fine.
  Evidence: `extension/manifest.json` (`core/bridge-token.js` is the only isolated script at
  document_start); the hard-load note in `installAutoChapterFilter` and the Force DVR block in
  `extension/ytkit-main.js`; CHANGELOG Unreleased, Hide AI Chapters.
  Touches: `extension/core/bridge-token.js` or a new document_start isolated script that reads
  those three settings from `chrome.storage.local` and publishes through the sealed channel,
  `extension/core/bridge-channel.js`, the userscript host (GM storage is synchronous there),
  `tests/hardening.test.js` content-script pins.
  Acceptance: a test boots the bridge with the three switches stored as on and shows each one
  readable by `ytkit-main.js` before a stubbed inline `ytInitialData` assignment; a headless hard
  load of a capture with AI chapters shows no AI markers on the bar; the storage read never delays
  `early.css` or the token; with the switches off nothing new is published.
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
