# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P0 — Ship the page-side bridge fix
  Why: from 4.89.0 to 4.91.0 every feature that runs inside YouTube's page (Force H.264, Codec
  Selector, Always Best Quality, audio track, Audio-Only Mode, the audio effects, Buffer /
  Preload, Force DVR, Filter Feeds Before Render, CPU Tamer, Photosensitive Flash Protection)
  received no settings, because `core/bridge-channel.js` never loaded in the MAIN world. Fixed on
  main in 5fe1afe1, but users only get it with a release. The deep audit's single version bump
  (to 4.92.0) wasn't done because the pass was stopped early.
  Where: release procedure in the repo `CLAUDE.md` (build-extension `--bump minor --profile both`,
  sync-userscript, docs/architecture.md and tests/project-facts.test.js version lines,
  generate:selector-asset, sign:feeds, project-facts, shipped-identity baseline, CHANGELOG
  heading, tag then main). Run `npm run smoke:main-bridge:live` against the built extension.
  Acceptance: a tagged release whose built extension passes `smoke:main-bridge:live`.
  Complexity: S

- [ ] P1 — Photosensitive Flash Protection switches itself off on GPU machines
  Why: 2026-09-28, measured live. The frame sampler fails closed after three samples over
  `FRAME_BUDGET_MS = 1`. A 2x2 `drawImage` + `getImageData` of a hardware-decoded YouTube frame
  took 4.6ms median, 5.8ms p90, 15.4ms max on an RTX 4070 SUPER (headless Chromium, D3D11), so
  every frame is over budget and the guard shuts off within a tenth of a second of starting.
  Software rendering sits right at the line (1.1ms median). With the budget at 8ms (what Video
  Hider and Subscription Groups already use) the guard stayed on `monitoring` across an in-app
  navigation and caught real flashes. At ~5ms a frame it also costs real main-thread time, so
  look at a capped sample rate or an off-thread read (`VideoFrame.copyTo`) at the same time.
  Where: `extension/ytkit-main.js` `FRAME_BUDGET_MS`, `extension/features/video-filters/index.js`
  `PHOTOSENSITIVE_FRAME_BUDGET_MS`, the `|| 1` fallback in `ytkit.js` `_startFallbackSampler`,
  `scripts/bench-startup.js` `PHOTOSENSITIVE_FRAME_BUDGET_MS`. Tests that pin 1ms:
  `tests/startup-performance.test.js` and two in `tests/features/video-filters.test.js`.
  Acceptance: on a GPU-accelerated headless run the guard stays on `monitoring` for a full
  minute of playback, and the three budget copies are held together by one test.
  Complexity: M

- [ ] P2 — Buffer / Preload has no player API to drive
  Why: 2026-09-28, checked live. The feature calls `movie_player.setBufferingGoal()`, which
  isn't in the player's public or internal API any more (245 methods listed; the only
  buffer-related ones are `preloadVideoById` and `preloadVideoByPlayerVars`). With the bridge
  fixed it now reports `degraded: player-api-missing` on every video, which is honest but
  means the feature does nothing.
  Where: `extension/ytkit-main.js` "Feature 3.5: Bounded VOD buffer target", `ytkit.js`
  `bufferPreload`.
  Acceptance: either a working lever (for example player config read at startup) verified
  live, or the feature retired with a CHANGELOG note.
  Complexity: M

- [ ] P2 — Live-check the other page-side features the bridge fix revived
  Why: these hadn't run for users since 4.89.0, so their live paths are untested against
  today's YouTube. Checked live on 2026-09-28 and working: codec filter, Always Best Quality,
  CPU Tamer's resource unlock, Force DVR (skips uploads), Filter Feeds Before Render (idle),
  audio track selection (after the fix in this pass). Not yet checked: Audio-Only Mode, Volume
  Boost, Mono to Stereo, Audio Normalization, Audio Pan, the EQ, auto gain, high-pass and audio
  sync offset.
  Where: `extension/ytkit-main.js` audio sections; probe pattern in
  `scripts/smoke-main-bridge-live.js`.
  Acceptance: each feature turned on in a live headless run with its effect observed (a Web
  Audio node in the graph, a status attribute, or the media element state), findings fixed or
  logged here.
  Complexity: M

- [ ] P2 — Adversarial review of the 2026-09-28 bridge commits
  Why: the deep audit's closing self-audit (a fresh-context reviewer that sees only the diff and
  the CHANGELOG) wasn't run because the pass was stopped early. The bridge commits change a
  security boundary and the content script layout.
  Where: eb95e4d6, 5fe1afe1, cc2a6f39 and the three fixes after them.
  Acceptance: the review's confirmed objections fixed or logged here.
  Complexity: S

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
  Why: 2026-09-28 audit. (1) Channel landing tab: non-Videos tabs only work on a hard load;
  after in-app navigation the embedded page data belongs to the previous page (`ytkit.js`
  ~10892). (2) Plausible: a dismissed "Still watching?" dialog stays in the DOM and keeps the
  gate open, so the auto-dismiss clicks Play when the user opens Save or Share
  (`_isYouTherePrompt`, ~15705). (3) The audio track status
  attribute keeps the previous video's `selected:<id>` after an in-app navigation to a video with
  no alternate tracks, and that video retries the whole ladder every time
  (`core/audio-track.js` `apply`, the `tracks.length === 0` return). Diagnostic only today.
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
