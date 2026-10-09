# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — About 900 catalogue keys per locale are still English placeholders
  Why: `docs/i18n-coverage.md` shows 27.5–28.4% "placeholder identical" in every non-English
  locale (2026-10-09: 830 keys are English in all ten). Some are whole features: Watch Feed's
  name is still the retired "Persistent Queue" everywhere, and 19 `watchFeed*` keys plus
  `blockedWatch*`, `bulk*` and `aiSummary*` copy are untranslated. A user who picks German sees
  those surfaces in English.
  Where: `extension/_locales/*/messages.json`; `node scripts/i18n-coverage.js` lists them, and
  `scripts/export-i18n-proofing.js` exports a proofing sheet.
  Acceptance: placeholder-identical under 5% in every locale, starting with whole surfaces
  (Watch Feed, the blocked-channel watch page, bulk actions), with the coverage report and
  placeholder baseline regenerated.
  Complexity: L

- [ ] P3 — Live-check the channel landing tab after an in-app move
  Why: 2026-10-09 shipped the fix code-only (no browser runs without the owner's word). The
  rule now waits for the tab list `yt-navigate-finish` brings (`_rw.navigatedChannelTabs`),
  reads the document's load path from the Navigation Timing entry (`HARD_LOAD_PATH`), and
  lands on Videos after 3 s if nothing arrives (ytkit.js booted after the move). The first
  attempt passed unit tests and failed live, so this one needs the live run too.
  Where: `extension/ytkit.js` (`documentLoadPath`, `captureNavigatedPageData`, `channelHasTab`,
  `redirectToVideosTab`), `tests/channel-landing-tab.test.js`.
  Also check the URL forms a 2026-10-09 review flagged: `channelHasTab` compares the channel base
  as an exact string, so `/channel/UC…`, `/c/`, `/user/`, a differently capitalised handle or a
  percent-encoded one never equals the payload's `/@Handle` and lands on Videos even when the tab
  exists.
  Acceptance: WHEN Channel Landing Tab is Live and the user clicks `/@NASA` from search results
  in headless Chromium with the staged extension, THEN the page SHALL end on `/@NASA/streams`;
  and WHEN the click lands before ytkit.js boots, THEN it SHALL end on `/@NASA/videos` within
  about 3 s; and a `/channel/UC…` link to a channel with a Live tab SHALL end on its Live tab.
  Complexity: S

- [ ] P3 — Follow-ups from the 2026-10-09 drain review
  Why: a read-only review of that drain's commits raised these as plausible but unconfirmed.
  Each needs a live page to settle.
  - Upcoming wording: with bare "premiere" gone, a French or German premiere card with no
    "À venir"/"Bevorstehend" badge no longer reads as upcoming in Video Hider, and pt_BR has
    only "programado para" (`core/text-metrics.js` `UPCOMING_CARD_PATTERN`).
  - Still Watching: if YouTube reopens the same closed prompt, the `yt-popup-opened` handler
    may run before layout, the on-screen gate refuses it, and the observer (child-list only)
    never retries. Separately, the player's Play button is still tried before the prompt's own
    confirm button, and the confirm button isn't looked up inside the gated dialog
    (`autoDismissStillWatching` in `extension/ytkit.js`).
  - Audio track: a track list that fills in after `canplay` (paused or autoplay-off loads) gets
    no retry until a later `playing` or player-state event (`core/audio-track.js` `apply`).
  Where: the files named above.
  Acceptance: each case reproduced live in headless Chromium and either fixed with a fixture
  test or shown not to happen, with the result written here.
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

- [ ] P3 — Headless Firefox 156 hangs at WebDriver session creation
  Why: on 2026-10-07 the system Firefox had auto-updated to 156.0.1. Every `startFirefoxSession`
  call (geckodriver 0.37.1, headless, with or without `--allow-system-access`, on 9222 or a free
  `--websocket-port`) printed "WebDriver BiDi listening" and then timed out at `POST /session`.
  Each left a firefox.exe that `taskkill /PID /T /F` reports as gone while CIM still lists it, still
  holding its BiDi port and locking its `astra-firefox-webdriver-*` profile. The heatmap check
  passed in Firefox on 155 earlier in the same drain. Blocks `npm run smoke:firefox` and the
  first-load item above.
  Where: `scripts/firefox-webdriver.js` (`startFirefoxSession`), `scripts/smoke-firefox-webext.js`.
  Acceptance: `npm run smoke:firefox` SHALL pass on the installed Firefox, with any geckodriver or
  Firefox pin it needs written in the repo CLAUDE.md, and no firefox.exe left behind afterwards.
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
