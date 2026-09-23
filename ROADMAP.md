# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P2 — View counts render in English in every locale
  Why: Theater Split's header builds its view count as a template literal ending in the
  word "views" (`_formatSplitViewCount` in `features/sticky-video-header/index.js`) and turns
  it into "watching now" for live streams with a regex on that English suffix. The Like/View
  Ratio badge in `extension/ytkit.js` (around line 25548) writes "likes from ... views" into
  its title and aria-label the same way. None of the i18n gates look inside an interpolated
  template literal, so all three passed while showing English to ar, de, ja and every other
  shipped locale, screen readers included.
  Touches: `extension/features/sticky-video-header/index.js`, `extension/ytkit.js`,
  `extension/_locales/*/messages.json`, `scripts/check-localizable-ui-copy.js`, `tests/`.
  Acceptance: WHEN the UI locale is not English, the split header's view count, its live
  "watching now" text and the like-ratio badge's title and aria-label SHALL come from locale
  keys present in all 11 locales, with the count formatted by the locale's number format;
  the live text SHALL no longer depend on matching an English suffix.
  Complexity: S

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.

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
