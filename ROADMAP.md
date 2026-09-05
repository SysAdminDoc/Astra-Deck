# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P2 — Show storyboard thumbnails under the clip timeline
  Why: the timeline gives the shape of the clip but not what is in it, and
  YouTube already ships the sprite sheets its own seek preview uses.
  Evidence: the player response carries `storyboards.playerStoryboardSpecRenderer.spec`;
  nothing in the repo parses it today (`grep -c storyboard extension/` is 0).
  Touches: `extension/features/download-ui/index.js`, `extension/core/`.
  Acceptance: WHEN a storyboard spec is present the track SHALL show the frame
  nearest the hovered or dragged position, and WHEN it is absent or fails to
  load the track SHALL keep working with no thumbnail and no error surfaced.
  Complexity: M

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P2 — Add non-default filtering, per-setting reset, and deep links to the settings overlay
  Why: the overlay owns all 484 settings but its diff view, field filters, and per-row reset exist only in the popup, so there is no way to answer "what did I change" or link a user to one control.
  Evidence: `extension/ytkit.js:42513` (substring search only); `location.hash` appears 0 times in `ytkit.js`; reset is category-wide at `ytkit.js:41732`; the diff view lives at `extension/popup.html:208-232`; the `risk:`/`category:`/`scope:` mini-DSL at `extension/popup.js:105` filters only 19 curated toggles.
  Touches: `extension/ytkit.js`, `extension/features/settings-panel/index.js`, `extension/core/settings-controller.js`, `extension/popup.js`.
  Acceptance: the overlay offers a "changed from defaults" filter with a count, a per-setting reset with the existing undo toast, and opens directly to a named setting from a URL fragment that the popup and failure copy can link to.
  Complexity: M

- [ ] P2 — Mark untranslated strings in non-English locales
  Why: about 29% of every non-English catalogue ships byte-identical English with nothing telling the user it is untranslated, so "11 locales" overstates what a user receives.
  Evidence: `docs/i18n-coverage.md` (833-859 placeholder-identical keys per locale, 0 missing); `extension/ytkit.js:39410` (`CATEGORY_META` is hardcoded English covering 10 of 18 schema categories).
  Touches: `scripts/i18n-coverage.js`, `extension/ytkit.js`, `extension/popup.js`, `extension/_locales/*/messages.json`.
  Acceptance: the language picker states each locale's translated percentage, `CATEGORY_META` resolves through `t()` for all 18 categories, and the coverage report is the single source for the number shown.
  Complexity: M

- [ ] P2 — Refresh selector packs on a schedule instead of only on a button press
  Why: the hot-update path exists and is verified, but a user whose install broke must know to press Refresh, so the mechanism helps only users who already diagnosed the problem.
  Evidence: `extension/background.js:990` fetches the asset with a SHA-256 check and rollback; the sole trigger is the popup control at `extension/ytkit.js:6914`; the `alarms` permission is already declared and used at `extension/background.js:305`.
  Touches: `extension/background.js`, `extension/core/selectors.js`, `extension/core/settings-schema.js`, `extension/popup.html`.
  Acceptance: an opt-in periodic refresh reuses the existing digest verification and rollback, respects the same 256 KB cap, records last-check and last-success times in the popup, and makes no request when disabled.
  Complexity: M

- [ ] P2 — Let the remote selector asset carry canary rules
  Why: only 9 of 33 packs declare a canary and the hot-update path cannot add one, so a newly broken surface stays undetectable until a release ships.
  Evidence: `grep -l "canary:" extension/core/selector-packs/*.js` returns 9 of 33; `extension/core/selectors.js:418-421` replaces `SurfaceSelectorMap`/`SurfaceSelectors` and never touches `SurfacePackRegistry`.
  Touches: `extension/core/selectors.js`, `extension/core/selector-health.js`, `scripts/build-selector-asset.js`, `selector-packs.json`, `tests/selector-health.test.js`.
  Acceptance: the asset schema accepts a `canary` block per surface, applying an asset installs those rules into the registry, the same digest verification and rollback apply, and a malformed canary block is rejected without disturbing shipped packs.
  Complexity: M

Sourced from the 2026-09-04 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P2 — Prove OS media controls survive the Web Audio graph
  Why: Astra routes YouTube's `<video>` through a Web Audio graph whenever any of six
  audio features is on, and has no Media Session code at all, so hardware media keys and
  the OS media panel are an untested casualty of a feature most users leave enabled.
  Evidence: `extension/ytkit-main.js:1549` calls `createMediaElementSource(video)` for
  mono-to-stereo, `volumeBoost`, normalization, auto-gain, high-pass and sync offset;
  `grep -ri "mediaSession|media key|SMTC"` returns zero hits across `extension/`,
  `docs/`, `ROADMAP.md` and `Roadmap_Blocked.md`; SponsorBlock issue #2543 (2026-09-01)
  reports exactly this failure class in a YouTube extension on Firefox.
  Touches: `extension/ytkit-main.js`, `extension/core/player.js`, a new probe under
  `scripts/`, `tests/`.
  Acceptance: a headless probe asserts that `navigator.mediaSession.metadata` and the
  play/pause/seek action handlers are still populated after the audio graph attaches and
  after it is torn down; if the graph is found to clear them, the MAIN world restores
  metadata and handlers from the player state; the manual result of pressing a media key
  with `volumeBoost` on and off, in Chrome and Firefox, is recorded in
  `docs/platform-api-adoption.md` with its date either way.
  Complexity: M

- [ ] P2 — Add a channel-page landing-tab setting
  Why: landing on a channel's Home tab buries the thing most people opened the channel
  for, and it is a live competitor request with no equivalent key in the schema.
  Evidence: Control Panel for YouTube issue #329 (2026-08-28); grepping
  `key: "channel...` in `extension/core/settings-schema.js` returns only
  `channelAgeDisplay` and `channelSubCount`.
  Touches: `extension/core/settings-schema.js`, `extension/default-settings.json`,
  `extension/ytkit.js`, `extension/_locales/en/messages.json`, `tests/`.
  Acceptance: a string enum setting defaulting to YouTube's own behaviour redirects a
  channel-page navigation to the chosen tab once per navigation, leaves deep links to a
  specific tab untouched, does nothing when the chosen tab is absent for that channel,
  and passes `check:settings` schema parity.
  Complexity: S

- [ ] P2 — Add an open-thumbnail-at-full-size action
  Why: the download path already resolves the highest-resolution thumbnail URL, so
  viewing one costs almost nothing on top, and it is a live competitor request.
  Evidence: Control Panel for YouTube issue #328 (2026-08-26); the schema has
  `downloadThumbnail` but no view action, alongside `thumbnailPreviewSize` and
  `thumbnailQualityUpgrade`.
  Touches: `extension/core/settings-schema.js`, `extension/default-settings.json`,
  `extension/ytkit.js`, `extension/_locales/en/messages.json`, `tests/`.
  Acceptance: the action reuses the existing thumbnail-resolution code rather than a
  second resolver, opens the full-resolution image in a new tab, is a visible control
  rather than a keyboard shortcut per the project convention, and falls back to the next
  available resolution when `maxresdefault` is missing.
  Complexity: S

- [ ] P2 — Say in the README that Astra restores the classic layout and the pre-Delhi player
  Why: undoing YouTube's redesign is the most-asked-for thing in the 2026 ecosystem and
  Astra's implementation is better than what third-party guides currently recommend, but
  the README never mentions it, and it also never states that Astra gives away the two
  things competitors charge for.
  Evidence: `extension/core/settings-schema.js:785` ships `classicLayoutProfile` with
  `modern`, `classic-2020` and `classic-2016`; `extension/ytkit.js:38424` is a CSS-only
  one-toggle pre-Delhi player restoration; the README description at `README.md:15`
  lists neither. Third-party 2026 coverage reports no official rollback exists and
  positions competitors mainly as the fix for the new player UI. PocketTube paywalls
  nested subscription groups and Glasp meters summaries at three a day; Astra's
  equivalents are free and BYO-key.
  Touches: `README.md`.
  Acceptance: the top-of-file description names the classic layout profiles and the
  pre-Delhi player restoration, a short comparison states which paid features Astra
  gives away, the prose carries no em dashes or other LLM tells per the project's
  writing rule, and `npm run check:project-facts` still passes.
  Complexity: S

- [ ] P3 — Split `features/sticky-video/index.js`
  Why: at 6,217 lines a peeled module has become its own monolith with a single test
  file, which is the worst code-to-test ratio in the tree and leaves the next peel with
  nowhere clean to attach.
  Evidence: `wc -l extension/features/sticky-video/index.js` is 6,217 against a 27-module
  total of 32,778; the module carries at least four separable concerns (mini player,
  Document PiP pop-out at `extension/ytkit.js:18359`, scroll behaviour, wheel gestures).
  Touches: `extension/features/sticky-video/`, `extension/runtime-bootstrap.js`,
  `scripts/generate-runtime-bootstrap.js`, `sync-userscript.js`,
  `scripts/check-userscript-drift.js`, `tests/features/`.
  Acceptance: the module is split along those concerns with each part registered in the
  runtime bootstrap and the userscript bundle list, each part has its own test file,
  `check:userscript-drift`, `check:userscript-symbols` and `check:userscript-size` pass,
  and `check:startup:captured` shows no regression against the recorded budget.
  Complexity: L

- [ ] P3 — Map the second commit identity with `.mailmap`
  Why: the public contributor list shows two people for one maintainer, which
  misrepresents authorship on a repo whose own rules are strict about contributor
  identity.
  Evidence: `git log --format='%an <%ae>'` returns 1,044 `SysAdminDoc`, 506
  `Matthew Parker`, 142 `Matt Parker` (all `matt_parker@outlook.com`) and 17
  `Matthew <snafumatthew@gmail.com>`; the GitHub contributors API lists that last
  identity separately with 17 commits dated 2026-06-08.
  Touches: new `.mailmap`.
  Acceptance: `git shortlog -sne` collapses to one identity, and the file records that
  GitHub's own contributor list is computed from commit metadata and will not change
  without a history rewrite, so that rewrite stays a separate deliberate decision.
  Complexity: S
