# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P1 — The MHTML capture tool no longer preserves inline scripts
  Why: `scripts/capture-watch-mhtml.js` is the only way to refresh the selector fixtures,
  and a capture taken today is materially weaker than the one it would overwrite. Running
  it to clear the stale evidence tracked in `Roadmap_Blocked.md` would silently throw away
  every inline payload the current fixture carries, and nothing would report it.
  Evidence: measured 2026-09-05 on Chrome 152.0.7977.83. The shipped
  `mhtml/WatchPage.mhtml` holds 62 `<script` tags, 19 `ytcfg` hits, 1 `INNERTUBE_API_KEY`,
  3 `ytInitialPlayerResponse` and 3 `videoDetails`. A fresh
  `node scripts/capture-watch-mhtml.js --surface watch --out <scratch>` produced a 4.4 MB
  file (against 1.8 MB) containing **zero** of any of them. The capture reports success and
  its own token checks pass, because `requiredTokens` only looks for `ytd-watch-flexy` and
  `movie_player`, which are DOM.
  Touches: `scripts/capture-watch-mhtml.js`, `scripts/build-selector-fixtures.js`, `tests/`.
  Acceptance: WHEN a capture is written the tool SHALL verify the snapshot still carries
  the inline payload it is expected to carry and SHALL fail rather than write a fixture
  that has lost it, and the `requiredTokens` list for the watch surface SHALL include at
  least one inline-script token so a DOM-only snapshot cannot pass. Whether the loss is
  recoverable (a `Page.captureSnapshot` flag, a different CDP call, or a Chrome change with
  no workaround) is part of the work; if it is not recoverable, the tool SHALL say so
  loudly instead of writing the degraded file.
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
