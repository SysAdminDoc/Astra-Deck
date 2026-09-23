# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

- [ ] P1 — The main userscript loads a core library one version behind it
  Why: `YTKit.user.js` on `main` says `@version 4.90.0` but `@require`s
  `refs/tags/v4.89.0/YTKit-core.user.js`, because the v4.90.0 bump rewrote the header
  version and never re-ran the `@require` sync. Userscript users therefore get the 4.89.0
  core: none of the v4.90.0 CSS fixes (full titles, the 183 restored declarations) reach
  them. Re-syncing alone is worse, since no `v4.90.0` tag exists and the `@require` would 404.
  Nothing caught it: every gate passes with the two versions disagreeing.
  Touches: `YTKit.user.js`, `scripts/check-versions.js`, `tests/`.
  Acceptance: WHEN the version gate runs, it SHALL fail if the main userscript's `@require`
  does not name `refs/tags/v<@version>`; the next version bump SHALL be synced and its tag
  pushed so the `@require` URL on `main` returns the matching core.
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
