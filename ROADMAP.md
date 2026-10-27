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
