# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P2 — Add non-default filtering, per-setting reset, and deep links to the settings overlay
  Why: the overlay owns all 484 settings but its diff view, field filters, and per-row reset exist only in the popup, so there is no way to answer "what did I change" or link a user to one control.
  Evidence: `extension/ytkit.js:42513` (substring search only); `location.hash` appears 0 times in `ytkit.js`; reset is category-wide at `ytkit.js:41732`; the diff view lives at `extension/popup.html:208-232`; the `risk:`/`category:`/`scope:` mini-DSL at `extension/popup.js:105` filters only 19 curated toggles.
  Touches: `extension/ytkit.js`, `extension/features/settings-panel/index.js`, `extension/core/settings-controller.js`, `extension/popup.js`.
  Acceptance: the overlay offers a "changed from defaults" filter with a count, a per-setting reset with the existing undo toast, and opens directly to a named setting from a URL fragment that the popup and failure copy can link to.
  Complexity: M

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
