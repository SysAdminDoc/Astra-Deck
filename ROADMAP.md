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

- [ ] P3 — Find what tripped Firefox's slow-script watchdog under Violentmonkey
  Why: a 2026-10-27 `smoke:private-window --browser violentmonkey` run logged "Script
  terminated by timeout" in a `_scan` called from `executeMutationRule` (YTKit.user.js
  4.101.2, line 59569 of the sandbox build). The lane still passed, but a terminated mutation
  rule leaves that feature half applied.
  Where: map the bundled line back to its source `_scan` (the live-chat engagement hider at
  `extension/ytkit.js:12386` is a candidate), then profile the mutation drain on a busy watch page.
  Acceptance: name the rule, show how long one drain takes, and either bound its work or show
  the watchdog fired on a whole-page stall that wasn't the rule's doing.
  Complexity: S

- [ ] P3 — Show and clear imported BlockTube title and channel rules
  Why: a BlockTube or ChannelSieve import stores per-field rules in
  `ytkit-imported-filter-rules` and Video Hider applies them, but no panel lists them. The
  only ways to drop one today are Undo Import or restoring an older backup.
  Where: the Video Hider section of `extension/features/settings-panel/index.js`, next to the
  keyword filter; the store and sanitizer are `sanitizeImportedFilterRules` in
  `extension/core/persisted-domains.js`.
  Acceptance: the panel lists each rule with its field (title or channel), kind and source,
  removes one with a click and clears all with toast feedback, and Video Hider picks the
  change up live through `_setImportedFilterRulesCache`. 11 locales.
  Complexity: S

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
