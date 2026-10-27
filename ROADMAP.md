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

- [ ] P2 — Show the side-panel page's comments panel in Theater Split's comment pane
  Why: with Theater Split on (the default) the split takes the page over, hides `#secondary` and
  mirrors `#below` into its pane. On the 2026-10 side-panel watch page the comments live in the
  engagement panel inside `#secondary`, so the pane shows the hidden classic `#comments` and no
  threads. The other comment features already follow the panel through `scopeCommentsCss` and
  `findCommentsRoot` (core/styles.js); the scoped rules that also need `#below` still miss it on
  purpose until the pane can host it.
  Evidence: `scripts/smoke-experience-live.js` check 'comment features follow comments into the
  side-panel page' has to turn `stickyVideo` off to see the panel at all.
  Touches: Theater Split's comment source in `extension/ytkit.js` (`stickyVideo`),
  `tests/watch-side-panel-capture.test.js`, the live check above.
  Acceptance: with forced side-panel flags and Theater Split on, the split's comment pane shows
  the panel threads (or the panel itself) on screen, Comment Search and the Comment Filter work in
  it, and closing the split puts the panel back in `#secondary`; the live check runs with
  `stickyVideo` on.
  Complexity: M

- [ ] P3 — List view for Home, search and channel grids
  Note (2026-10-13): `listFeedLayout` already covers Home, Subscriptions and search in
  `extension/features/home-subs-css/index.js:329-434` with lifecycle handling at line 493.
  Keep those paths and their saved keys. The remaining implementation scope is channel
  `/videos` grids and consistent entry controls, plus the live acceptance checks below.
  `scripts/smoke-headless-a11y.js` does not currently capture feeds; add a feed reflow
  fixture/lane to it for the 320 px acceptance below rather than assuming one exists.
  Add `scripts/smoke-headless-a11y.js` and the new feed fixture to Touches.
  Why: a list layout has 19 reactions on ImprovedTube's request and Control Panel
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

### Now (P1)

### Next (P2)

- [ ] P2 — Prove the private-window fence in real Chrome and Firefox private windows
  Why: the storage fence, anonymous private fetches and cookie-store binding are unit-tested
  against mocks (`tests/private-context.test.js`, the private cases in `background.test.js`),
  but no browser run has opened a private window with the extension allowed there yet.
  Touches: a new `scripts/smoke-private-window.js` lane next to the existing smoke scripts.
  Acceptance: Chrome for Testing with "Allow in Incognito" seeded in the profile, and
  Firefox with private-browsing access granted, each play a video, add to Watch Feed and
  bookmark in a private window; regular `chrome.storage.local` stays byte-identical, the
  private tab still reads its own copy, and closing it clears the copy. Seed distinct
  regular and private sentinel cookies and show the handoff returns only the private
  store's, and that a private transcript fetch goes out without cookies. Repeat the storage
  half under Tampermonkey and Violentmonkey in a private window.
  Complexity: M

- [ ] P2 — Import compatible BlockTube and ChannelSieve filter backups atomically
  Why: migration has a concrete export contract and documented failures in competing importers.
  Evidence: https://github.com/amitbl/blocktube/blob/master/src/ui/options.js,
  https://github.com/825i/channelsieve/blob/master/CHANGES-FORK.md,
  https://github.com/varshneydevansh/FilterTube/issues/79, and its `js/io_manager.js` parser.
  Astra's Takeout/NewPipe subscription imports already ship and are a different workflow.
  Touches: `extension/features/video-hider/index.js`, `extension/features/settings-panel/index.js`,
  `extension/popup.js`, `extension/core/settings-import-transaction.js`, `regex-safety.js`,
  11 locales and import fixtures.
  Acceptance: recognize top-level `filterData` separately from Astra settings; import stable
  channel/video IDs and literal/regex rules only when semantics map losslessly. Show counts
  for valid, duplicate, invalid and unsupported entries, including comment/duration rules
  that cannot map. Discard JavaScript, `uiPass`, account state and unknown options; never
  execute imported code. Bound file size, rule count and regex work. Parse/validate before
  one atomic merge with one undo; failures leave existing settings and hidden records intact.
  Complexity: M

- [ ] P2 — Restore original titles on modern cards with canonical channel exceptions
  Why: original-title handling still targets older cards and lacks a bounded per-channel escape.
  Evidence: `antiTranslate` at `extension/ytkit.js:17371`; upstream renderer/allowlists at
  https://github.com/zpix1/yt-anti-translate/blob/main/app/src/global.js and cached oEmbed/
  videoDetails retrieval in `app/src/background.js`. Request-flood failure:
  https://github.com/zpix1/yt-anti-translate/issues/193.
  Touches: `extension/ytkit.js` original-title handling, modern feed renderer helpers,
  existing external request/cache boundaries, settings controls, 11 locales and title tests.
  Acceptance: after DeArrow identity guards, cover current lockups and watch titles using
  cached `GET https://www.youtube.com/oembed?url=<encoded-watch-url>` with validated
  `title` and `author_url`, and a bounded player `videoDetails` fallback for 401. Reuse Astra's
  current client/version rather than upstream's hardcoded version; do not assume a missing
  `hl` guarantees original-language output. Test a card whose text and title attribute are
  both translated. Use canonical channel IDs for title-only exceptions. No extra channel-search request is made
  merely to evaluate an exception; no lookup occurs while disabled. Bound cache, concurrency
  and retry, cancel stale work, and prevent MutationObserver request loops. Preserve the
  accepted DeArrow crowd title while updating its original backing metadata/fallback.
  Tests cover navigation, renderer reuse, exceptions, offline failure and both writers on.
  Complexity: M
