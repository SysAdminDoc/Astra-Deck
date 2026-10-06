# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

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

- [ ] P3 — Tell an upcoming premiere lockup linked into a radio from a Mix
  Why: Hide Mixes and Watch Feed treat a card with no running time and a radio link as a Mix
  unless it carries a live or upcoming marker. The upcoming checks look for
  `[overlay-style="UPCOMING"]`, `[data-upcoming]` and `[is-upcoming]`, which 2026-09 lockup cards
  don't have, so a premiere in the music sidebar still reads as a Mix (fourth verification pass).
  Where: `extension/features/video-hider/index.js` `radioCandidate` (~1798),
  `extension/ytkit.js` Watch Feed's copy (~23551).
  Acceptance: a fixture trimmed from a live capture of an upcoming lockup in a watch sidebar,
  and a test that it is not a Mix and keeps its Watch Feed button.
  Complexity: S

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

- [ ] P3 — Popup Settings Overview shows internal category slugs
  Why: 2026-09-28 polish pass. Each overview row is headed with the schema's raw category
  ("playback-audio", "watch-player", "shell", "a11y-perf", "dev-diagnostics" and 13 more), in
  every locale. These 18 buckets don't line up with the settings panel's 13 categories, so the
  panel's translated names can't simply be reused.
  Where: `extension/popup.js` ~4526 (`nameSpan.textContent = cat`), the free-text match at
  ~4437, `extension/core/settings-schema.js` `category`, `extension/_locales/*/messages.json`.
  Acceptance: WHEN the overview renders, each row SHALL show a localized category name from
  keys present in all 11 locales, and a search for that name SHALL still match its rows.
  Complexity: S

- [ ] P3 — Popup and side panel have no light theme
  Why: 2026-09-28 polish pass. Both pages are dark only (`surface-system.css` tokens have no
  `prefers-color-scheme: light` set), while the in-page settings panel follows YouTube's theme.
  Someone on a light YouTube gets a dark popup next to a light page.
  Where: `extension/surface-system.css` `--astra-*` tokens, `extension/popup.css`,
  `extension/sidepanel.css`; `scripts/smoke-headless-a11y.js` already captures a light variant
  for in-page surfaces and would need one for these two.
  Acceptance: both pages follow `prefers-color-scheme` with a light token set that passes the
  a11y smoke's contrast and focus checks in light and dark.
  Complexity: M

- [ ] P3 — Surfaces the 2026-09-28 polish pass didn't reach
  Why: that pass covered the Command Deck, popup, side panel, download panel, Video Hider,
  transcript states, comment search, toasts and the Theater Split captures. These got no
  light/dark and state review: the live chat enhancements, the AI summary and Transcript Q&A dialogs, the Subscription Groups
  manager, the player right-click menu, the SponsorBlock segment UI, and the Digital Wellbeing
  prompts.
  Where: `extension/live-chat.js` / `live-chat.css`,
  `extension/ytkit.js` (`aiVideoSummary`), `extension/features/subscription-groups`,
  `extension/features/sponsorblock`, `extension/features/digital-wellbeing`.
  Acceptance: each surface captured headless in light and dark (default, hover, focus,
  disabled, empty, error), with findings fixed or logged here.
  Complexity: M

- [ ] P3 — Block Comment Authors has no entry point when the comment menu is hidden
  Why: the Block item lives in the ⋮ menu YouTube opens from a comment. Two setups remove
  that menu: signed-out pages (YouTube renders the menu empty and the button zero-size) and
  Studio Comments (`chatStyleComments` hides `#action-menu` outright). Blocking still works there by typing the
  handle into Blocked Comment Authors, but nothing on the comment offers it.
  Where: `extension/features/comment-author-block/index.js`,
  `extension/features/chat-style-comments/index.js` (the `#action-menu` hide).
  Acceptance: WHEN the comment menu is absent or hidden, THEN each comment SHALL still offer a
  keyboard-reachable Block control (for example in the Studio Comments hover toolbar).
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
  `heatmapMarkersFor`. The userscript runs the same code, so one fix covers both.
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

- [ ] P3 — Firefox extension: first YouTube load after a temporary install logs "Runtime module load failed undefined"
  Why: 2026-09-29, seen in headless Firefox during the userscript parity pass. The first
  YouTube page after `about:debugging` loads the add-on logs the failure once, then every later
  load is clean. It looks like a race between the runtime bootstrap and the module loader on the
  very first page, and the error value is lost on the way to the log (`undefined`).
  Where: `extension/runtime-bootstrap.js`, `extension/runtime-core-loader.mjs` (the catch that
  logs it).
  Acceptance: a fresh temporary install's first YouTube load SHALL log no module failure, and a
  real failure SHALL log its message and the module that failed.
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

- [ ] P3 — Video Loop Button is invisible while Player Dock is on
  Why: 2026-10-05, found adding the dock's Repeat button. `videoLoopButton` inserts
  `.ytkit-loop-btn` into `.ytp-right-controls`, and Player Dock (default On) hides every child
  of that bar except `#ytkit-player-controls`, so turning the setting on shows nothing. The dock's
  Repeat now does the same job. Both write `video.loop`, but only one is ever clickable.
  Where: `extension/ytkit.js` `videoLoopButton` (~19288), `features/player-dock/index.js`
  `.ytp-right-controls > *:not(#ytkit-player-controls)`.
  Acceptance: WHEN Player Dock is on, THEN the Video Loop Button setting SHALL either be marked
  as covered by the dock's Repeat (card note or conflict pair) or be retired through both
  retirement lists with a CHANGELOG note. WHEN the dock is off, the standalone button SHALL keep
  working.
  Complexity: S

## Research-Driven Additions

Sourced from the 2026-10-05 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P2 — Channel blocks and the allowlist can't identify watch-sidebar cards
  Why: `_extractChannelInfos` builds identities from channel links, and the 2026-10 sidebar lockups
  have none: the byline is a plain span and the avatar carries no href. A live run on 2026-10-06
  identified 0 of 20 sidebar cards (search cards 20 of 20), so a blocked channel still shows up
  under every video, and allowlist mode can't judge those cards (it fails open). Channel-page grids
  have no byline either, but there the page itself names the channel.
  Evidence: `extension/features/video-hider/index.js` `_extractChannelInfos`; the sidebar card in
  `tests/fixtures/feed-card-layouts-2026-10.html`.
  Acceptance: WHEN a blocked channel's video appears in the watch sidebar, THEN it SHALL hide,
  using an identity that can't collide between two channels with the same display name (a
  video-to-channel cache filled from surfaces that do carry links, or a name match limited to
  names the user blocked from that surface).
  Complexity: M

- [ ] P2 — Hide thumbnail badges ("New", "4K")
  Why: YouTube started stamping "New" on thumbnails around 2026-09-18, and three other projects'
  trackers asked for a way to hide the badges that month. Control Panel shipped it in v1.36.0.
  Evidence: https://github.com/insin/control-panel-for-youtube/issues/335,
  https://github.com/code-charity/youtube/issues/4358,
  https://github.com/YouTube-Enhancer/extension/issues/1425, Control Panel v1.36.0 notes.
  Confidence: Verified demand; selectors need a live capture.
  Touches: `extension/core/settings-schema.js` (new key through the nine-places checklist), the
  feed CSS in `extension/ytkit.js` or a feature module, `extension/_locales/**`, tests.
  Acceptance: WHEN enabled, THEN the badge row SHALL be hidden on Home, Subscriptions, search,
  related and channel cards while the duration overlay and watched progress bar stay, using
  selectors taken from a live page. Default off.
  Complexity: S

- [ ] P2 — Hide videos YouTube labels "Made with AI"
  Why: the strongest request of the window (Weedout's Show HN reached 185 points on
  2026-09-01), and YouTube made the label more visible on 2026-05-27. Astra's
  `hideVideosSyntheticNarrationFilter` matches text markers, not YouTube's own label. The other
  existing AI item (Roadmap_Blocked "Hide the new AI surfaces") covers Ask and search carousels,
  not this.
  Evidence: https://github.com/masteranza/weedout-for-youtube (MIT). The label exists only in
  watch-page data at `videoPrimaryInfoRenderer.badges[].metadataBadgeRenderer` (icon `INFO`,
  label "AI"). Feed cards carry nothing, so Weedout makes one InnerTube `next` call per card with
  a `fields` mask and caches the verdict. Confidence: Verified mechanism, Likely for Astra.
  Touches: a new module under `extension/features/`, the MAIN-world bridge for watch-page data, a
  `storage.local` verdict cache, `extension/core/settings-schema.js` (two keys),
  `extension/_locales/**`, `docs/privacy-policy.md` for the lookup mode, tests, license notices
  if Weedout code is adapted.
  Acceptance: stage one sends nothing. WHEN a watch page carries the label, THEN its video ID
  SHALL be cached and its cards hidden everywhere after, with hide-attribution. Stage two is
  opt-in and default off: masked lookups behind a concurrency cap chosen from a measured live run.
  Complexity: L

- [ ] P2 — Pin the userscript's `@require` libraries with SRI hashes
  Why: the three libraries load from `raw.githubusercontent.com/.../refs/tags/v<version>/`, so a
  moved or re-pushed tag changes the code every install runs and nothing checks it. Greasy Fork
  accepts `@require` URLs that carry SRI hashes, which also helps the blocked Greasy Fork listing.
  Evidence: `sync-userscript.js:46,62`; https://greasyfork.org/en/help/external-scripts.
  Confidence: Verified gap; manager behavior on a mismatch needs the smoke run.
  Touches: `sync-userscript.js`, `YTKit.user.js`, the userscript drift gate,
  `scripts/smoke-userscript-managers.js`.
  Acceptance: every `@require` URL carries a `#sha256=` hash of the exact bytes sync writes, and a
  gate fails when a hash and its file disagree. The manager smoke shows Tampermonkey and
  Violentmonkey load the real hash and refuse a tampered one.
  Complexity: S

- [ ] P3 — Bring the What's New note to userscript users
  Why: the extension popup shows a What's New banner after an update, but the userscript has no
  popup and the in-page panel shows nothing. Userscript installs update themselves from main, so
  new settings like v4.94.0's Repeat arrive unseen. ZeroDelay v1.5.0 does the same kind of note.
  Evidence: `extension/popup.js` ~5592-5861 (`showWhatsNew`, `ytkit_last_seen_version`, declared
  in `extension/core/persisted-domains.js:125`); no reference in `extension/ytkit.js`,
  `extension/features/` or `userscript/`. Confidence: Verified.
  Touches: the in-page settings panel header, a shared last-seen check moved out of `popup.js`,
  `extension/_locales/**` (reuse `whatsNewDetailTpl` and `whatsNewDetailFromTpl`), tests.
  Acceptance: WHEN the userscript's version is newer than the stored last-seen one, THEN the
  panel SHALL show the same dismissible note once, linking the release notes, with no network
  request and no toast on page load. The extension popup's behavior stays the same.
  Complexity: S

- [ ] P3 — List Astra Deck on awesome-userscripts
  Why: users browse that list (3,548 stars) for scripts, and Astra isn't on it. Its rules ask for
  a stable install URL, docs, an issue tracker and tested browser and manager pairs, and v4.93.0
  meets all of them.
  Evidence: https://github.com/awesome-scripts/awesome-userscripts/blob/main/CONTRIBUTING.md.
  Confidence: Verified.
  Touches: `README.md` (a tested-pairs line), then a pull request to that list.
  Acceptance: README names the browser and manager pairs the smokes cover, and a pull request
  following that CONTRIBUTING.md is open.
  Complexity: S

- [ ] P3 — Bump eslint to 10.12 and acorn to 8.19
  Why: eslint 10.12.0 shipped 2026-10-02 and acorn 8.19.0 is out. `package.json` pins acorn at
  exactly 8.16.0 and eslint at `^10.9.1`. Updates here are manual by policy.
  Evidence: `package.json:117-118`; `npm view eslint version` and `npm view acorn version` on
  2026-10-05. Confidence: Verified.
  Touches: `package.json`, `package-lock.json`, any lint or parse output that shifts.
  Acceptance: both bumped, and `npm run check` and `npm test` give the same results as before
  apart from the known deps finding.
  Complexity: S

- [ ] P3 — Check the Shorts settings against Shorts Series on desktop web
  Why: YouTube began rolling Shorts Series out to the web on 2026-09-23. If series shelves or the
  series player use new renderers, `removeAllShorts`, `redirectShorts` and
  `shortsAsRegularVideo` may miss them.
  Evidence: https://www.droid-life.com/2026/09/23/youtube-teases-3-neat-new-features/.
  Confidence: Needs live validation (not yet seen on desktop web on 2026-10-05).
  Touches: the Shorts selectors in `extension/ytkit.js` and selector packs, tests.
  Acceptance: once a series surface shows on desktop web, capture it. Each of the three settings
  either covers it, with a fixture test, or gets the selector it needs.
  Complexity: S
