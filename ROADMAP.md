# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — Finish the English UI strings built outside the copy gate's sinks
  Why: the 2026-09-23 audit swept every untagged template literal with `${}` in extension
  code and found user-facing English the UI-copy gate cannot see (copy built in a `return`,
  passed to a helper, or set on a property it does not scan). The settings panel status line
  and the SponsorBlock skip announcement are fixed; these remain, each English in all 11
  locales: Digital Wellbeing's daily-limit and break messages
  (`features/digital-wellbeing/index.js` ~380, ~394); the Subscription Groups import summary
  and its "(s)" plurals (`features/subscription-groups/index.js` ~3061-3067) and the
  "N days since newest rendered upload" reason (~1006, ~1362); the settings import summary
  and Takeout import messages in `extension/ytkit.js` (~5107-5117, ~5416, ~5425); the popup's
  service-health age ("5m ago", "never", `popup.js` `formatExternalHealthAge`); the
  installer-ready status in `features/download-ui/index.js` ~1189; the feature-bisect summary
  (`core/feature-bisect.js` ~201) and the import preview line (`core/persisted-domains.js`
  ~897). Re-run the sweep before starting: an acorn walk over TemplateLiteral nodes whose
  static text carries English words, minus logs, errors and selectors.
  Where: the files above, `extension/_locales/*/messages.json`.
  Acceptance: WHEN the UI locale is not English, each string above SHALL render from catalogue
  keys present in all 11 locales, with counts through `tCount`.
  Complexity: M

- [ ] P3 — Retire the drifted settings-panel fallback copy in ytkit.js
  Why: `attachUIEventListeners()` in `extension/ytkit.js` (~43586) delegates to the
  settings-panel module and otherwise runs a full inline copy of the panel's handlers. That
  copy only runs when the module failed to load, and it has already drifted: its reset and
  export statuses are English literals where the module now routes them through `t()`. The
  same peel was finished for Theater Split, whose monolith copy is a descriptor stub.
  Where: `extension/ytkit.js` (the inline fallback around ~43586 onward),
  `tests/ux-theming-fixes.test.js` (pins the fallback's literals), `scripts/check-monolith-peel.js`.
  Acceptance: WHEN the settings-panel module is unavailable, ytkit.js SHALL fall back to a
  stub that reports the panel as unavailable rather than to a second implementation, and the
  monolith-peel gate SHALL record the removal.
  Complexity: M

- [ ] P2 — Settings panel per-card Reset doesn't repaint or take effect
  Why: 2026-09-28 audit, confirmed. Single Reset saves the default but leaves the checkbox or
  textarea showing the old value (a textarea blur then saves it back). It dispatches no
  `ytkit-settings-changed`, skips parent re-init and conflict enforcement, so Custom CSS stays
  injected after reset. The Changed filter misses the ~45 `guideHide_*` style cards and the
  Reset marker goes stale after select, range, color and textarea edits.
  Where: `extension/features/settings-panel/index.js` (~180-221 reset, ~4035 changed view,
  ~4432-4552 non-toggle handlers).
  Acceptance: Reset SHALL go through the same path as a user toggle (repaint, event, conflicts,
  init/destroy) and keep focus on the card.
  Complexity: M

- [ ] P2 — Settings deep links never land on a setting
  Why: 2026-09-28 audit, confirmed. 16 of the 17 popup chip keys match no card; the
  `#ytkit-setting=` new-tab route is only read when the panel is built; the pane switch runs
  before listeners attach; the open routine then moves focus to the search box.
  Where: `extension/popup.js` (~4525, ~4563), `extension/features/settings-panel/index.js`
  (~3335, ~3790, open-focus ~324-339), `extension/ytkit.js` `requestSettingFocus` (~6914).
  Acceptance: WHEN a deep link names a setting, THEN the panel SHALL open on its category with
  that card focused, and SHALL report false when no card exists.
  Complexity: M

- [ ] P2 — Page script can read the MAIN-world bridge token
  Why: 2026-09-28 audit, confirmed by PoC. `YTKitCore.mainBridgeReader` (with a `token` getter)
  sits on the page's `window`; the navigate event carries `detail.token`; `seal()` calls
  `String.prototype.charCodeAt` and `Math.imul` at verify time; `audio-track.js` looks the
  reader up on every call. A page can forge codec, quality, audio track, volume boost and EQ,
  or freeze the bridge with a huge counter. Tab-local, but the CHANGELOG claims otherwise.
  Where: `extension/ytkit-main.js` ~67, `extension/core/bridge-channel.js` (~69-95, ~185, ~266,
  ~338), `extension/core/audio-track.js` ~166, `tests/bridge-forgery.test.js`.
  Acceptance: the reader SHALL not be published, the token SHALL not leave the closure, primitives
  SHALL be bound at document_start, and the forgery test SHALL model page-script access.
  Complexity: M

- [ ] P3 — Selector asset hardening
  Why: 2026-09-28 audit, confirmed. The stored `ytkit-selector-asset` is never re-verified and
  outlives upgrades (the disable feed got a `-v2` key bump for this; the asset didn't). Any old
  signed pack replays (no version floor). Selectors allow `{`, `}` and `url(`, which reach
  `injectStyle`. Scheduled refresh has no in-flight dedupe (8 tabs, 8 refreshes) and the body
  fetch has no timeout.
  Where: `extension/ytkit.js` (~882, ~918-957, ~13577), `extension/core/selectors.js`
  (~443-601), `extension/core/styles.js` ~89, `extension/background.js` (~2216-2246).
  Acceptance: stored assets SHALL be re-verified or re-keyed, versions below the shipped pack
  rejected, selectors validated with `CSS.supports('selector(...)')`, refresh deduped with a timeout.
  Complexity: M

- [ ] P3 — Smaller audit leftovers
  Why: 2026-09-28 audit. (1) The popup skip link shows on every open for mouse users:
  `focusInitialPopupControl()` focuses it and `.skip-link:focus` (not `:focus-visible`) paints it
  (`popup.js` ~1799, `popup.css` ~112). Needs a real popup render to confirm. (2) Channel
  landing tab: non-Videos tabs only work on a hard load; after in-app navigation the embedded
  page data belongs to the previous page (`ytkit.js` ~10892). (3) Plausible: a dismissed "Still
  watching?" dialog stays in the DOM and keeps the gate open, so the auto-dismiss clicks Play
  when the user opens Save or Share (`_isYouTherePrompt`, ~15705).
  Acceptance: each item fixed with a regression test, or closed with evidence it can't happen.
  Complexity: M

- [ ] P3 — Block Comment Authors has no entry point when the comment menu is hidden
  Why: the Block item lives in the ⋮ menu YouTube opens from a comment. Three setups remove
  that menu: signed-out pages (YouTube renders the menu empty and the button zero-size),
  Studio Comments (`chatStyleComments` hides `#action-menu` outright), and the userscript,
  whose defaults set `hideCommentActionMenu: true`. Blocking still works there by typing the
  handle into Blocked Comment Authors, but nothing on the comment offers it.
  Where: `extension/features/comment-author-block/index.js`,
  `extension/features/chat-style-comments/index.js` (the `#action-menu` hide),
  `YTKit.user.js` defaults.
  Acceptance: WHEN the comment menu is absent or hidden, THEN each comment SHALL still offer a
  keyboard-reachable Block control (for example in the Studio Comments hover toolbar), and the
  userscript SHALL either show the menu by default or provide the same fallback.
  Complexity: S

- [ ] P3 — Theater Split: comments header chip offset and collapsed-rail hint
  Why: 2026-09-28 redesign leftovers. The comments count chip sits about 8 px low because an
  empty `h3` in the header still takes a gap. The closed divider rail gives no hint that a
  click reopens comments.
  Where: `extension/features/sticky-video-styles/index.js` `buildSplitCommentsCss` and the
  divider rules in `buildSplitShellCss`; regenerate the standalone with
  `npm run generate:theater-split-css`.
  Acceptance: the chip SHALL align with the header text in dark and light captures, and the
  closed rail SHALL expose a visible and accessible "Show comments" affordance.
  Complexity: S

- [ ] P2 — Heatmap features have no curve after in-app navigation
  Why: since the 2026-09-28 fix, Jump to Most Replayed and Heatmap Smart Speed ignore page data
  that belongs to another video, so after you click from one video to another they do nothing
  until a full reload. The ISOLATED world only has the hard-load inline scripts. The fresh curve
  arrives in the `/next` response (`frameworkUpdates.entityBatchUpdate.mutations[].payload
  .macroMarkersListEntity`), which only the MAIN world sees.
  Where: `extension/ytkit-main.js` and `extension/core/bridge-channel.js` (carry the markers
  across), `extension/ytkit.js` heatmap `_readMarkers` (x2), `extension/core/heatmap.js`
  `heatmapMarkersFor`. Userscript: `YTKit.user.js` jumpToMostReplayed.
  Acceptance: WHEN you click from one video to another, THEN both features SHALL use the new
  video's curve without a reload, and SHALL still refuse a curve whose id doesn't match.
  Complexity: M

- [ ] P3 — Watch Feed Import is unreachable when the feed is empty
  Why: 2026-09-28 audit, confirmed. Import lives in the Watch Feed panel, and the only way into
  the panel is the pill, which `_renderPill()` removes when the feed is empty. A new install or a
  cleared feed can't restore a backup.
  Where: `extension/ytkit.js` persistentQueue `_renderPill` (~23215) and `_togglePanel`
  (~23351, Import at ~23379).
  Acceptance: WHEN the feed is empty, THEN Import SHALL still be reachable from the keyboard
  (for example from the feature's settings card or an empty-state pill).
  Complexity: S

- [ ] P3 — Check the userscript's page-data reads under `@inject-into content`
  Why: `YTKit.user.js` declares `@inject-into content`. Where a manager honors that (Violentmonkey,
  and Firefox builds), `window` is the sandbox, so `window.ytInitialPlayerResponse` and
  `window.ytInitialData` may be undefined and Anti-Translate Chapters, Jump to Most Replayed and
  the other readers quietly do nothing. Not tested in a real manager yet.
  Where: `YTKit.user.js` header and every `window.ytInitial*` read (grep).
  Acceptance: each supported manager SHALL be shown to expose the payload, or the reads SHALL
  fall back to parsing the page's inline scripts the way the extension does.
  Complexity: S

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

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.
