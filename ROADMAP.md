# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P3 — Make CSS-template compaction automatic instead of allowlisted
  Why: `sync-userscript.js` now has three ways to find a stylesheet (a named const, a
  named `return`, and a shape scan over an allowlisted module). A module that grows a new
  inline stylesheet is compacted only if someone remembers to add it, and the cost of
  forgetting is invisible: the bundle just gets bigger against a hard 2 MiB host cap.
  Evidence: `COMPACT_INLINE_CSS_MODULES` was added in v4.90.0 covering eleven modules and
  reclaimed about 25 KB that had never been compacted. The two older name-keyed maps could
  not reach any of it because the CSS is written as an argument at the call site.
  Touches: `sync-userscript.js`, `tests/bundle-headroom.test.js`.
  Acceptance: the shape scan runs over every bundled module rather than an allowlist, with
  the interpolation and backslash guards kept; a round-trip check asserts every
  `property: value` pair present in a module's source CSS survives compaction; the three
  maps collapse to one mechanism; `check:userscript-size` and the headroom floor pass.
  Complexity: M


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
