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

- [ ] P1 — Watch Feed replays a queued video that ends in the miniplayer
  Why: 2026-09-28 audit, confirmed by probe. `_finishCurrent()` reads the finished id from
  `location`, which is null on home, search and channel pages, so nothing is removed and
  `_playNext()` navigates back to the video that just ended (still first in the queue).
  Where: `extension/ytkit.js` persistentQueue `_finishCurrent` / `_playNext` (~23098).
  Acceptance: WHEN a queued video ends in the miniplayer, THEN it SHALL be removed using the
  player's own video id, and auto-advance SHALL start the next entry.
  Complexity: S

- [ ] P2 — Watch Feed queues only the first video of Mix and playlist cards
  Why: 2026-09-28 audit, confirmed. `_extractCardData` accepts `watch?v=X&list=RD...` cards and
  stores X under the Mix's title ("Mix - Some Artist"). The video hider already detects mixes
  (`features/video-hider/index.js` ~1733).
  Where: `extension/ytkit.js` `_extractCardData` and `_addButtons` (~23339-23385).
  Acceptance: WHEN a card links to a Mix or playlist, THEN no Watch Feed button SHALL be added
  (or it SHALL queue the playlist explicitly), never the first video under the list's title.
  Complexity: S

- [ ] P3 — Watch Feed import count, `$` in titles and English tooltip
  Why: 2026-09-28 audit, all confirmed. Import reports entries that `_write()` then cuts at
  the 200 cap ("10 added" when 1 fit). `.replace('{title}', title)` treats `$$` and `` $` ``
  in a title as replacement patterns, garbling labels and tooltips. The panel row tooltip is a
  hard-coded `` `${it.title} by ${it.channel}` ``. Related, lower severity: focus is lost after
  move/remove/Clear, Import is unreachable with an empty feed, and Clear has no Undo.
  Where: `extension/ytkit.js` (~23122-23136 import, ~23208 tooltip, ~23233, ~23411 labels).
  Acceptance: import SHALL report what was stored; titles SHALL be inserted with a function
  replacement; the tooltip SHALL come from a catalogue key in all 11 locales.
  Complexity: S

- [ ] P2 — Heatmap features use the previous video's curve after in-page navigation
  Why: 2026-09-28 audit, confirmed against the WatchPage capture. The curve only exists in
  `ytInitialData`'s `macroMarkersListEntity`, read from hard-load inline scripts that go stale
  on SPA navigation. Jump to Most Replayed seeks to the old video's peak and Smart Speed uses
  the old hot and cold regions. The userscript (`window.ytInitialData`) has the same bug.
  Where: `extension/ytkit.js` `_rw.ytInitialData` reader (~1186) and both heatmap callers
  (~19306, ~19401, ~19449); `YTKit.user.js` ~10012.
  Acceptance: WHEN the payload's `externalVideoId` (or `currentVideoEndpoint` id) differs from
  `getVideoId()`, THEN both features SHALL ignore it.
  Complexity: S

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

- [ ] P3 — Thumbnail View button borrows the download button's labels
  Why: 2026-09-28 audit, confirmed. `_setButtonFeedback` hard-codes download labels and a
  shared 2 s revert timer, so View reads "Download thumbnail" after a click and its error says
  "Retry download". Toggling `openThumbnailButton` doesn't apply until the next navigation.
  Where: `extension/ytkit.js` `_setButtonFeedback` (~25645), `hasRelevantSettingsChange` for
  `downloadThumbnail`.
  Acceptance: each button SHALL keep its own labels and timer; the toggle SHALL apply live.
  Complexity: S

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

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.
