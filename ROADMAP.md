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

- [ ] P2 — Give the runtime a ytInitialData accessor, or drop the dead heatmap fallback
  Why: the most-replayed marker parser offers two sources and one of them is always
  undefined, so the A/B fallback its own comment describes has never produced a marker.
  Evidence: `extension/ytkit.js:19134` and `:19227` call
  `parseHeatmapMarkers(_rw.ytInitialData)`; the `_rw` object declared at `ytkit.js:1092`
  exposes only `ytInitialPlayerResponse` (grep for ytInitialData inside that object
  returns 0). The comment above the call says "the curve can arrive on either object
  depending on the A/B bucket, so both are offered and the parser picks".
  Touches: `extension/ytkit.js`, `tests/`.
  Acceptance: WHEN the heatmap is absent from the player response but present in
  ytInitialData the markers SHALL still parse, and WHEN neither carries it the feature
  SHALL behave exactly as it does today; or, if reading ytInitialData is rejected, the
  dead call and its comment are removed so the code stops claiming a fallback it has not
  got. Either outcome is pinned by a test.
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
