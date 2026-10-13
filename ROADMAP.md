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

- [ ] P2 — DeArrow options Astra still lacks
  Why: v4.99.0 brought DeArrow to YouTube's lockup cards and added its cover fallback, but
  upstream's config (`src/config/config.ts` syncDefaults) has more that people use:
  `hideDetailsWhileFetching` (hide a card's title and cover until the lookup answers, so the
  clickbait never flashes; upstream default on), `thumbnailSaturationLevel`,
  `shouldCleanEmojis` (default on), the smarter title-case formatter (keeps acronyms and
  all-caps brand words, `src/titles/titleFormatter.ts`), casual mode's per-category vote
  thresholds (`casualVotes` in the branding answer) and `showOriginalThumbWhenCasual`, and
  the privacy lookup `GET /api/branding/:sha256HashPrefix` (first 4 hex chars). Voting and
  submitting stay in Roadmap_Blocked (they write to the live database).
  Where: `extension/features/dearrow/index.js`, `extension/core/settings-schema.js`,
  `extension/_locales/**`, `tests/features/dearrow.test.js`.
  Acceptance: each option behaves as upstream's does, with a test per option and a live
  headless check that cards still fill in.
  Complexity: M

- [ ] P2 — Treat `youtube.com/live/<id>` links as watch pages
  Why: `core/url.js` reads a video id from `/live/<id>` (VIDEO_ID_PATH_PREFIXES), but
  `core/page.js` `isWatchPagePath` only accepts `/watch` and youtu.be ids, so `getCurrentPage`
  never returns WATCH on a `/live/` link and every watch-page feature (Force DVR included) stays
  off there. The 2026-10-10 review of the early switches found the mismatch; the early pass now
  follows `page.js` and skips `/live/` until this lands.
  Evidence: `extension/core/page.js` ~53-59, `extension/core/url.js` ~8-12,
  `tests/core-page-url.test.js:53`, `extension/core/early-switches.js` `isWatchPath`.
  Touches: `core/page.js`, `core/early-switches.js` (accept `/live/<11-char id>` again),
  `tests/core-page-url.test.js`, `tests/early-switches.test.js`.
  Acceptance: `getCurrentPage('/live/<id>')` is WATCH while `/@channel/live` and `/live_chat` are
  not; the early pass publishes on a `/live/<id>` hard load; a headless load of a live `/live/`
  link shows a watch-page feature running (owed check).
  Complexity: S

- [ ] P2 — Live Latency Catch-up never runs on today's watch player
  Why: its `_isLive` looks for `#movie_player.ytp-live`, a class the watch player no longer
  carries (checked on a live stream 2026-10-12), and its fallback needs a latency from
  `getLivePlaybackMetrics`, which reads `video.seekable`. That range now ends at the media
  source's duration, about a day past the edge, so the latency it reports is never real.
  Switching `_isLive` to `isLiveStreamPlaying()` alone would boost the rate at the edge from that
  bogus latency, so it was left as is when the speed features moved to the badge.
  Where: `extension/ytkit.js` `liveLatencyCatchup` (`_isLive`, `_metrics`),
  `extension/core/player.js` `getLivePlaybackMetrics`.
  Acceptance: latency comes from the MAIN-world player (its live-edge state or
  `getProgressState`), the readout shows a few seconds on a live stream at the edge, the boost
  only runs while behind the target, and `tests/features/live-latency.test.js` drives a badge-only
  live page.
  Complexity: M

- [ ] P3 — Translate the Sleep Timer chip's leftover English
  Why: the 2026-10 translation pass missed literal strings in the chip: the two screen-reader
  announcements ("Sleep timer elapsed. Playback paused.", "Sleep timer cancelled.") and the "+5"
  button's title and aria-label ("Add 5 minutes", "Add 5 minutes to sleep timer"), plus its Cancel
  label. Found 2026-10-12 while fixing the tests that pass left behind.
  Where: `extension/ytkit.js` `sleepTimer` (~17609, ~17660-17676), 11 locale catalogues.
  Acceptance: each string goes through `t()` with a new key translated in all 11 locales, the
  i18n gates and placeholder baseline are updated, and the sleepTimer render test reads the keys.
  Complexity: S

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
