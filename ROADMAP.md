# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — English UI strings the 2026-10-06 sweep found outside the copy gate's sinks
  Why: re-running the template-literal sweep for the "built outside the sinks" item turned up
  more English UI copy than that item listed, all English in every locale. In `extension/ytkit.js`:
  Quick Links' add/remove/limit toasts, the sleep timer's set/extend toasts and its menu label,
  the watch-time stats line ("Today: … | This week: …"), the channel-skip "Skipped:" toast, the
  Watch Feed "N of M" / "N items" counters, the comment search "Match N of M" / "Thread N of M"
  lines, the settings profile saved/not-found/imported toasts (with "profile(s)"), the AI
  summary citation counts ("invented citation(s)"), the audio-track notices, the DeArrow
  per-channel override toast, the transcript batch progress and "No transcripts matched", the
  protocol handoff note, the panel's reset/undo and "needs host access" toasts, and the
  "saved" toasts for text and range settings. Elsewhere: `features/settings-panel/index.js`
  ("Hidden Video … Ready to Review" through an English `countLabel`), `features/video-hider`
  (the "Can't read … on this page's cards" notice), `features/download-ui` (the runtime repair
  label and both Cobalt fallback notices), `core/date-time.js` (the relative-time fallback) and
  `core/external-api-health.js` ("cache is … old"). Each is a template literal assigned to a
  variable or returned before it reaches a sink, so the gate can't see it.
  Where: the files above, `extension/_locales/*/messages.json`. The sweep: an acorn walk over
  TemplateLiteral nodes with English words in their static text, minus logs, errors, AI prompt
  bodies, file names and selectors.
  Acceptance: WHEN the UI locale is not English, each string above SHALL render from catalogue
  keys present in all 11 locales, with counts through `tCount`.
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

- [ ] P3 — Watch Feed Import is unreachable when the feed is empty
  Why: 2026-09-28 audit, confirmed. Import lives in the Watch Feed panel, and the only way into
  the panel is the pill, which `_renderPill()` removes when the feed is empty. A new install or a
  cleared feed can't restore a backup.
  Where: `extension/ytkit.js` persistentQueue `_renderPill` (~23215) and `_togglePanel`
  (~23351, Import at ~23379).
  Acceptance: WHEN the feed is empty, THEN Import SHALL still be reachable from the keyboard
  (for example from the feature's settings card or an empty-state pill).
  Complexity: S

- [ ] P3 — Confirm the Firefox first-load module failure is gone
  Why: the runtime loader now names the failing module and retries once when a load rejects with
  no value, aimed at the "Runtime module load failed undefined" line seen 2026-09-29 on the first
  YouTube load after a temporary install. The race hasn't been reproduced since, so the retry
  guards the symptom and isn't a confirmed fix. A 2026-10-06 run of
  `scripts/smoke-firefox-webext.js` from a worktree timed out at 280 s, and the smoke listens only
  to `log.entryAdded`, so it can't assert extension console errors anyway.
  Where: `scripts/smoke-firefox-webext.js`, `extension/runtime-core-loader.mjs`.
  Acceptance: the Firefox smoke SHALL capture the extension's console, and a fresh temporary
  install's first YouTube load SHALL log no module failure there.
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

- [ ] P3 — Popup pseudo-locale lane of the headless a11y smoke fails
  Why: `node scripts/smoke-headless-a11y.js --fixture-states --surface popup` fails its pseudo
  lane with "popup/pseudo: pseudo-locale copy did not render". It fails on main before the
  2026-10-06 light-theme change too, so the lane has been red unseen: the smoke isn't part of
  `npm run check`, and the pseudo lane is the one that proves popup copy goes through i18n.
  Where: `scripts/smoke-headless-a11y.js` (the pseudo stage, ~60 and ~300),
  `scripts/generate-pseudolocale.js`, `extension/popup.js` locale selection.
  Acceptance: WHEN the a11y smoke runs the popup surface, THEN the pseudo lane SHALL render
  pseudo-locale copy and pass, and a test SHALL fail if the lane quietly renders real copy.
  Complexity: S

## Research-Driven Additions

Sourced from the 2026-10-05 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P3 — Userscript: blocked channels still show in the watch sidebar
  Why: the extension reads a sidebar card's channel from YouTube's card data in its MAIN-world
  script (`ytkit-main.js`, lockup channel tags). The userscript build has no MAIN-world bridge, so
  its sidebar cards still name no channel and a blocked channel's videos show there.
  Where: `sync-userscript.js`, `extension/features/video-hider/index.js` (`_readLockupChannels`),
  `extension/core/feed-prefilter.js` (`describeLockupChannels`).
  Acceptance: WHEN the userscript runs and a blocked channel's video is in the watch sidebar, THEN
  it SHALL hide.
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
