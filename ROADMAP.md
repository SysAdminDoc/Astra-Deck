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

- [ ] P2 — Live Latency Catch-up never runs on the 2026-10-12 watch player
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

- [ ] P1 — Register factory providers even when their features start disabled
  Why: settings-gated loading can leave descriptor-only fallbacks for the tab's lifetime,
  so enabling a feature does not reach its implementation. This is a prerequisite for #52.
  Evidence: Verified source in `scripts/generate-runtime-bootstrap.js:18-36` and factory
  consumers in `extension/ytkit.js`; `tests/runtime-bootstrap.test.js:167` covers only the
  Home/Subs and Subscription View gates removed in v4.99.3. See `RESEARCH.md` startup boundary.
  Touches: `scripts/generate-runtime-bootstrap.js`, `extension/runtime-bootstrap.js`,
  `extension/runtime-core-loader.mjs`, factory consumers in `extension/ytkit.js`,
  `tests/runtime-bootstrap.test.js`, `scripts/smoke-experience-live.js`.
  Acceptance: generate an inventory of factory providers and their consumers; every
  descriptor-only consumer receives a real factory when cold-disabled, then starts on
  enable without a reload. Keep actual observers, network requests and feature init gated.
  Exercise every provider's cold-off transition, plus bounded browser interaction profiles.
  Click the real settings control and fail the live harness on extension-origin runtime
  exceptions. Preserve the startup budget without relaxing its baseline.
  Complexity: M

- [ ] P1 — Keep the settings panel usable when a feature module is unavailable
  Why: a valid saved profile with hider features disabled cannot open settings or recovery.
  Evidence: Verified live click on `#ytkit-masthead-btn` throws
  `videoHiderFeature?._getHiddenVideos is not a function` at
  `extension/features/settings-panel/index.js:1610`, through `:1669` and `:2937`.
  Other object-only optional calls occur at `:1618`, `:1972`, `:2180`, `:2489`, `:2790`,
  and `:2914-2915`. Canonical fresh defaults work. See `RESEARCH.md`.
  Touches: `extension/features/settings-panel/index.js`, Video Hider storage/list access,
  settings-panel tests, `scripts/smoke-experience-live.js`.
  Acceptance: after the factory repair above, seed existing hidden records, cold-start with
  all hider gates off, and open all settings panes through the real button. Also simulate
  a failed module. Use stable storage-backed reads or method guards with an unavailable/retry
  state; retain lists and counts without fabricated empty data or destructive writes.
  Other categories, export and recovery remain reachable, with zero uncaught exceptions.
  Complexity: S

- [ ] P1 — Bind Resume Playback restores and listeners to the active video generation
  Why: a delayed restore can seek the next video, and a superseded init can leak listeners.
  Evidence: Verified VM using real `resumePlayback._restore` and `init` at
  `extension/ytkit.js:21430` and `:21458`. A saved 123-second restore for A sought reused
  video B; deferred enable/disable/enable reads installed two `pagehide` listeners and
  final destroy left one. See `RESEARCH.md` async ownership.
  Touches: `extension/ytkit.js` `resumePlayback`, its feature tests and readiness cleanup.
  Acceptance: check generation and current video identity after every await and before a
  seek; own and cancel readiness listeners/timers. Real-method tests defer storage reads,
  navigate A to B on a reused element, and resolve old work after destroy or a newer init.
  B retains its own position and final teardown leaves zero listeners and timers.
  Complexity: S

- [ ] P1 — Recheck DeArrow renderer identity before applying asynchronous branding
  Why: same-route card reuse can receive an older video's title or thumbnail.
  Evidence: Likely source-supported race at `extension/features/dearrow/index.js:577-584`;
  `_resetReusedCards` at `:777` handles reuse, while `_waitForCover` at `:676` already checks
  video identity. Analogous report: https://github.com/ajayyy/DeArrow/issues/530.
  Touches: `extension/features/dearrow/index.js`, `tests/features/dearrow.test.js`.
  Acceptance: share a guard for connected renderer, active generation, dataset video ID
  and resolved video ID before title, thumbnail and peek writes. Defer A's branding,
  recycle its renderer to B or remove it, then resolve A. No A content is painted and B
  still processes. Verify the normal title/cover fallback and original-peek paths.
  Complexity: S

- [ ] P1 — Report asynchronous feature initialization only after it settles
  Why: rejected initialization is currently marked healthy and becomes an unhandled rejection.
  Evidence: Verified VM of `initFeatureLifecycle` at `extension/ytkit.js:6545`; an async
  rejection returned true, set `_initialized`, and yielded healthy status in
  `extension/core/feature-health.js:230`. Separately, Verified source shows `start` at
  `extension/core/feature-lifecycle.js:114` sets `record.started` without observing promises.
  Touches: `extension/core/feature-lifecycle.js`, `feature-health.js`, lifecycle wrappers
  and callers in `extension/ytkit.js`, lifecycle and health tests.
  Acceptance: define starting/success/failure for sync and promise-returning initializers,
  observe rejection, and bind completion to a generation. Rejecting or resolving old work
  after destroy cannot reactivate a feature or overwrite a newer attempt. Clean owned
  resources on failure. Audit callers that assume an immediate boolean return, and test
  real wrapper behavior with deferred resolution/rejection and zero unhandled rejections.
  Complexity: M

- [ ] P1 — Give overlapping presets deterministic per-setting ownership
  Why: disabling Privacy can undo active Focus, and later Focus rollback resurrects stale
  values or discards an explicit edit. New visual presets must not inherit this behavior.
  Evidence: Verified real-method VM with state-commit and persistence dependencies stubbed,
  using Privacy and Focus at
  `extension/ytkit.js:39153` and `:39263`; `hasRelevantSettingsChange` at `:6603` misses
  shared-key restoration. Reproduction and limits are in `RESEARCH.md` preset ownership.
  Touches: preset methods and backup helpers in `extension/ytkit.js`, relevant-settings
  dependencies, storage/import compatibility, preset and cross-tab tests.
  Acceptance: define per-key recipe layers with explicit edits taking priority. From
  Shorts removal and infinite-scroll blocking off, enable Privacy then Focus, explicitly
  disable infinite-scroll blocking, and disable the presets in both orders. A remaining
  recipe keeps its owned values; removing all restores baseline except explicit edits.
  Reload, import and cross-tab echoes preserve that contract and existing setting keys.
  Complexity: M

- [ ] P1 — Isolate private-session history, feed consumption and credential requests
  Why: automatic records lack a private-context fence, and a spanning worker can use its
  own regular credentials for a private sender. End-to-end leakage is not yet reproduced.
  Evidence: Verified missing guards in `extension/core/storage.js:387`,
  `extension/core/persisted-domains.js:88-91`, `extension/ytkit.js:15810`, `:19088`, `:19097`,
  `:21404`, `:23521`, and hardcoded false in `userscript/host.js:780`.
  Transcript credential defaults are at `extension/core/transcript-service.js:692-723`
  and `extension/background.js:2443-2448`. Browser/manager and cookie contracts are cited
  in `RESEARCH.md` private-context and credential-isolation sections.
  Touches: shared context helper near `extension/core/env.js`, `browser-api.js`, storage
  domains, viewing features, Watch Feed, diagnostics, `userscript/host.js`,
  `extension/core/transcript-service.js`, `cookie-handoff.js`, `extension/background.js`.
  Acceptance: content uses native `extension.inIncognitoContext`; background trusts
  `sender.tab.incognito`, never a caller flag; the manager adapter captures sandbox
  `GM_info.isIncognito` and exposes the same contract. Unknown means automatic records
  stay in memory and authenticated requests use anonymous fallback or fail closed, never
  silently become regular-context requests. Preserve the userscript's existing lack of
  authenticated cookie downloads. Private progress, resume, watch time, caches, diagnostic page IDs and
  Watch Feed consumption never change regular storage or backups; use a private feed copy.
  Keep explicit Copy/Export/Download available and label ephemeral in-app saves.
  Force private transcript requests to omit regular-worker credentials. Preserve Firefox's
  existing exact `cookieStoreId`; otherwise resolve `cookies.getAllCookieStores()` by
  sender tab membership. Bind store/private state into one-use tab/document/URL capabilities
  and fail closed on unresolved/mismatched stores, preserving partition/FPI constraints.
  Isolated Chrome and Firefox tests with private access enabled prove normal storage stays
  unchanged and private close clears ephemeral state. Seed distinct normal/private/container
  sentinel cookies; inspect proxy/handoff output for absence of normal-store values and
  assert transcript credentials are omitted. Handoff uses the exact store or fails closed.
  Test manager parity separately.
  Complexity: L

- [ ] P1 — Use familiar fresh-install defaults and one opt-in visual starter choice, #52
  Why: the only open report asks for fewer forced visual changes and clearer choices while
  retaining all saved preferences. This should compose the existing design, not add a wizard.
  Evidence: https://github.com/SysAdminDoc/Astra-Deck/issues/52;
  `extension/core/settings-schema.js:126-174`, `extension/ytkit.js:4112`, and saved-over-default
  merge at `:5091-5123`. Existing parity checks are in `build-extension.js:899-929` and
  `scripts/check-settings.js:158-181`. See `RESEARCH.md` reported issues.
  Touches: canonical defaults, schema/default JSON generation, existing preset machinery,
  `extension/features/settings-panel/index.js`, appearance/feed control aliases, 11 locales,
  default-parity and settings migration tests, existing setup docs.
  Acceptance: land factory activation, partial-runtime settings recovery and preset ownership
  first. New profiles keep familiar YouTube presentation; make square search/avatars,
  subscriptions/home grid changes, hidden sidebar, square UI, watch restyle and Theater Split
  explicit choices through one visual starter using existing controls and one undo.
  Consolidate overlapping appearance/feed entries without renaming stored keys. Preserve
  every explicit saved true/false/value in sparse and full legacy bags, imports and cross-tab
  updates. Do not guess touched fields.
  Blocked on: Matt's call on which defaults flip (2026-10-26 drain). The saved bag is sparse
  (`extension/core/settings-schema.js:957`, `:996`), so flipping a default silently changes
  every existing profile that never touched that key, Matt's own included. The seven
  opinionated keys on today are `widenSearchBar`, `squareSearchBar`, `squareAvatars`,
  `subscriptionsGrid`, `homepageGridAlign`, `hideSidebar` and `watchPageRestyle`. Matt's
  recent direction runs the other way (DeArrow on by default in v4.99.0, `channelLengthSort`
  on in v4.100.0). If he approves, the change needs a one-time migration that writes the old
  default into existing non-empty bags for each flipped key, so only fresh installs see the
  new defaults; add a sparse-bag test that an upgraded profile renders unchanged.
  Keep DeArrow's current default unless a separate decision changes it. Verify dark/light
  fresh and migrated profiles, discoverability, opt-in styling, and existing parity gates.
  Complexity: M

### Next (P2)

- [ ] P2 — Resolve npm links and package identities in the release SBOM
  Why: the generated inventory reports nested paths and link stubs as required package names.
  Evidence: Verified read-only `buildSbom` evaluation of `scripts/generate-release-sbom.js:46-73`
  includes bogus `web-ext/node_modules/@devicefarmer/adbkit@0.0.0`;
  https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/ and
  https://cyclonedx.org/docs/1.5/json/ define the relevant structures.
  Touches: `scripts/generate-release-sbom.js`, release SBOM tests and existing artifact docs.
  Acceptance: resolve link targets before classification, derive real names/versions and
  dependency reachability, and deduplicate by valid PURL without merging distinct versions.
  Local, nested, dev-only and dangling-link fixtures produce an accurate dependency closure
  or an explicit invalid-link error. Describe this as build-tooling scope, not browser
  runtime dependencies. Preserve the adbkit security stub.
  Complexity: S

- [ ] P2 — Authenticate repair-feed sequence and expiry rather than receipt time alone
  Why: replaying a valid old signature currently refreshes the apparent age of the feed.
  Evidence: Verified source at `extension/background.js:1194-1208` and `:1246-1330`;
  https://theupdateframework.github.io/specification/latest/ describes authenticated freshness.
  Selector downgrade protection already exists at `extension/core/selectors.js:642-651`.
  Touches: data-only signed feed metadata, `scripts/sign-remote-feeds.js`, build validators,
  `extension/background.js`, `extension/core/feature-disable-feed.js`, cache/replay tests.
  Acceptance: sign a monotonic sequence, issued UTC time and bounded expiry in a CSV header
  or envelope. Persist highest sequence and digest; reject older sequences, changed bytes at
  the same sequence, and expired payloads. Receiving unchanged bytes must not extend signed
  freshness. Invalidate/refetch legacy entries without signed sequence/expiry; never derive
  their validity from `cachedAt`. Retain the highest-sequence watermark after cache expiry
  or eviction. Test clock skew, rollback, same-sequence replay, offline startup and signed
  expiry while receipt age is still under six hours. Preserve the six-hour refresh and explicit 30-day stale policy
  only within the signed validity bound, with a visible stale state. No remote code or full
  TUF framework is introduced.
  Complexity: M

- [ ] P2 — Persist a bounded diagnostic failure journal independently of settings edits
  Why: an error can disappear on reload before the next unrelated preference save.
  Evidence: Verified `record()` behavior and its persistence comment in
  `extension/core/diagnostic-log.js:66-100`. See `RESEARCH.md` diagnostics.
  Touches: `extension/core/diagnostic-log.js`, storage-domain ownership, diagnostic tests.
  Acceptance: after private-context isolation and promise-aware lifecycle reporting, an
  opted-in redacted error survives reload without a settings edit. Debounce bounded writes
  and retain the existing ring cap/redaction. Quota failure cannot recursively log or break
  the feature. Error storms stay within the cap and write budget; private contexts remain
  memory-only and secret/page-sensitive data never enters exports or backups improperly.
  Complexity: M

- [ ] P2 — Align existing privacy, permission, setup and intake documents with behavior
  Why: current copy misstates automatic network flows, store-safe loopback access and defaults.
  Evidence: Verified source mismatch between `docs/privacy-policy.md` and
  `extension/core/data-flow.js:184-203`, `docs/cws-submission-checklist.md:462` and retained
  store-safe companion access, `INSTALL.md` versus `CONTRIBUTING.md:27`, and the API-default
  and automatic-close text in the two `.github` templates. See `RESEARCH.md` documentation truth.
  Touches: those existing docs, `.github/ISSUE_TEMPLATE/feature_request.md`,
  `.github/pull_request_template.md`, stale descriptions in `Roadmap_Blocked.md`, and existing
  doc-truth check anchors. Do not create new Markdown docs or duplicate blocked store tasks.
  Acceptance: disclose raw-GitHub repair checks and their six-hour/manual triggers, correctly
  describe companion loopback access per profile, state Chrome's userscript permission step,
  match current opt-in/default behavior, and stop encouraging automatic issue closure before
  reporter confirmation. Correct browser-absent and sidebar permission-gating claims against
  current tooling and `extension/sidepanel.js`. Existing doc-truth checks catch these mismatches.
  Complexity: S

- [ ] P2 — Retry a failed transcript load without reloading the watch page
  Why: a transient caption failure leaves reload advice without a working recovery action.
  Evidence: Verified live unavailable state after a failed caption fetch with `transcriptViewer`
  enabled. `extension/ytkit.js:20840` already has an abort/generation-aware load path.
  This is not evidence that the inspected video has no captions. See `RESEARCH.md` UI recovery.
  Touches: transcript viewer error/render/load paths in `extension/ytkit.js`, 11 locales,
  transcript tests and live experience smoke.
  Acceptance: a visible Retry reuses the bounded load path without seeking playback or
  reloading. Distinguish no-caption results from retryable failures, announce busy/result
  state, prevent duplicate retries, and abort on close, disable or navigation. Empty cues
  cannot be exported. Failure-to-success, repeated failure and late old-response tests pass.
  Complexity: S

- [ ] P2 — Add a click-only pointer alternative for Theater Split width changes
  Why: pointer users must drag to resize; existing keyboard support alone does not meet
  WCAG 2.5.7's alternative requirement.
  Evidence: `extension/features/sticky-video/index.js:407-451` handles arrow keys and collapse,
  while width changes by pointer require mouse/touch movement;
  https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html.
  Touches: compact split controls in `sticky-video-header/index.js`, divider controller in
  `sticky-video/index.js`, existing ratio storage, 11 locales and split/a11y tests.
  Acceptance: provide a contextual click-track range or narrower/wider buttons using
  `_applyDividerRatio` and its 25%-85% bounds. Width changes with single clicks/taps, persists,
  and updates the divider's accessible value. Dragging, click-to-collapse and reopening still
  work. Verify dark/light, narrow panes and teardown without a new global hotkey or banner.
  Do not treat the rail width alone as a target-size failure; its pseudo-element extends it.
  Complexity: M

- [ ] P2 — Keep the Watch Feed Add action reachable in Theater Split
  Why: the enabled native watch button is hidden with `#actions` while Split is open.
  Evidence: Verified live zero-geometry Add button in Split; disabling `stickyVideo` exposes
  it and a real click adds the video. `extension/features/sticky-video-header/index.js:890-893`
  docks other actions but omits Watch Feed; Quick Links has no alternate action
  (`extension/ytkit.js:14990`). `README.md:248-253` promises the control on every watch page.
  Touches: `extension/features/sticky-video-header/index.js`, Watch Feed button ownership in
  `extension/ytkit.js`, split restore tests, `scripts/smoke-experience-live.js`.
  Acceptance: dock the existing Add button or put it in the existing compact overflow when
  enabled. Preserve its pressed state, label and listener identity across split open/close,
  comment collapse and navigation. Real clicks add/remove exactly once on VOD and live pages;
  the control stays reachable in narrow panes, and teardown restores its native location.
  Complexity: S

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
