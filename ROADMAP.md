# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P0 — Make release currency a blocking gate and tag the outstanding releases
  Why: 67 commits and 13 releases including the 4.85.1 cookie-handoff security fix are unshipped while every channel serves 4.82.0, and `npm run check` stays green.
  Evidence: `scripts/run-checks.js:30` calls `check-versions.js` without `--require-release-current`; `release-channels.json` shows `active: 4.82.0` on all five channels; `git tag --list | sort -V | tail -1` is `v4.84.3`; `git rev-list v4.84.3..HEAD --count` is 67.
  Touches: `scripts/run-checks.js`, `release-channels.json`, `CHANGELOG.md`.
  Acceptance: `npm run check` fails while any channel trails the newest tag; the GitHub-full and userscript channels are promoted to the current version with digests verified by `npm run release:channels`. Store channels stay governed by the submission items in `Roadmap_Blocked.md`.
  Complexity: M

- [ ] P1 — Convert the 14 zero-behavior test files to executed assertions
  Why: 40.4% of all assertions pin source text, and 14 files carry no behavioral coverage at all, against a helper that documents a real bug shipping past a source pin that matched the broken code exactly.
  Evidence: measured 5,086/12,602 source-shape assertions; 100%-source files led by `tests/userscript-parity.test.js` (55/55), `tests/userscript-fixes.test.js` (40), `tests/regression-deep-pass-3.test.js` (19), `tests/features/link-hygiene.test.js` (17), `tests/speed-popup-placement.test.js` (17), `tests/feature-module-resilience.test.js` (16), `tests/download-popup-navigation.test.js` (13); rationale at `tests/helpers/monolith.js:3-7`.
  Touches: the 14 named files, `tests/helpers/monolith.js`, `tests/helpers/source.js`.
  Acceptance: each converted file loads its subject through `tests/helpers/monolith.js` or `require` and asserts observable output; every converted assertion is validated by reverting the code under test and confirming the test goes red.
  Complexity: L

- [ ] P2 — Detect altered or synthetic content from the InnerTube payload instead of title text
  Why: the current synthetic filter is a title and description regex that misses correctly disclosed videos and false-positives on ordinary titles, while YouTube's own disclosure travels in the player response.
  Evidence: `extension/features/video-hider/index.js:28` (`SYNTHETIC_NARRATION_PATTERN` is text-only; the module reads `playerResponse` once); the technique is demonstrated in https://github.com/code-charity/youtube/pull/4275, which tests `generativeAi|generatedWithAi|alteredOrSynthetic|madeWithAi` against the player response. The 2026-08-23 pass rejected this only for lack of a stable DOM selector, which the payload path does not need.
  Touches: `extension/features/video-hider/index.js`, `extension/ytkit-main.js`, `extension/core/settings-schema.js`, `tests/features/video-hider.test.js`.
  Acceptance: the filter reads disclosure keys by walking the player-response object (never `JSON.stringify` of the whole payload), falls back to the existing text heuristic when no key is present, changes nothing when the keys are absent, and reports which signal fired in the hide reason. Validate the key set against a captured labeled video before enabling by default.
  Complexity: M

- [ ] P2 — Resolve collaborator channels when applying channel block rules
  Why: channels that publish as multi-channel collaborations evade single-channel rules, which is the documented evasion route for AI-content channels.
  Evidence: `extension/features/video-hider/index.js:129` and `:1055-1063` resolve exactly one channel identity per video; reported against comparable tools in https://github.com/amitbl/blocktube/issues/697 and https://github.com/code-charity/youtube/issues/4153.
  Touches: `extension/features/video-hider/index.js`, `extension/core/selector-packs/feedCard.js`, `tests/features/video-hider.test.js`.
  Acceptance: a card naming two or more channels is hidden when any named channel is blocked, the hide reason names which one matched, and the allowlist is honored when any named channel is allowlisted.
  Complexity: M

- [ ] P2 — Harden the MAIN-world bridge against forged page events and attributes
  Why: the bridge takes both its commands and its data from channels any page script can write, so YouTube-origin script or an injected third party can drive it.
  Evidence: `extension/ytkit-main.js:8-10` defines the `documentElement` attribute channel read at `:569`, `:737`, `:759`; the bridge additionally reacts to `yt-navigate-finish`, `yt-page-data-updated`, and `loadedmetadata`, all of which a page script can `dispatchEvent`. Reachable impact today is limited to playback quality and codec strings (`ytkit-main.js:766`), which is why this is P2 rather than P0.
  Touches: `extension/ytkit-main.js`, `extension/core/player.js`, `tests/ytkit-main.test.js`.
  Acceptance: the bridge captures the DOM and JSON natives it depends on at `document_start` before page script runs, and ignores attribute writes and events that do not carry a per-page token generated by the isolated-world side; a test dispatching a forged `yt-navigate-finish` and a forged attribute write asserts both are ignored.
  Complexity: M

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

- [ ] P3 — Fail the Firefox lint gate on its existing warnings
  Why: `web-ext lint` already reports six findings that the gate reads and discards, and the AMO-hosting noise that made it unadoptable is removable with the flag that matches this repo's distribution model.
  Evidence: `scripts/check-firefox-webext.js:45-53` invokes `lint --source-dir --output json` only; a read-only run reports four `UNSAFE_VAR_ASSIGNMENT` warnings on the dynamic imports at `extension/runtime-bootstrap.js:351`, `:380`, `:402` and `extension/runtime-core-loader.mjs:121`, plus `MANIFEST_PERMISSIONS` for `sidePanel` on Firefox.
  Touches: `scripts/check-firefox-webext.js`, `extension/runtime-bootstrap.js`, `scripts/generate-runtime-bootstrap.js`, `scripts/manifest-patch.js`.
  Acceptance: the gate runs with `--self-hosted` and `--warnings-as-errors`; each of the six findings is either resolved or carries a recorded, dated suppression naming why it is safe.
  Complexity: M

- [ ] P3 — Handle the crx3 2.0.0 null keypair result
  Why: `keypair()` returns `null` instead of throwing when the key path is unwritable, so a signing run on a read-only directory produces an unsigned artifact without saying so.
  Evidence: crx3 2.0.0 changed `keypair()` to return `null` on an unwritable key path (https://raw.githubusercontent.com/ahwayakchih/crx3/master/CHANGELOG.md); `build-extension.js:1066` does not test the result.
  Touches: `build-extension.js`, `tests/build-extension.test.js`.
  Acceptance: a null keypair aborts the build with a message naming the unwritable path, and a test asserts the failure instead of a silent unsigned output.
  Complexity: S

- [ ] P3 — Retire the dead selector-health alias and the test-only exports
  Why: `nodeIsInInactiveSelectorTree` has no caller anywhere in the repository, and two more exports exist only for tests, which makes the module's public surface misleading.
  Evidence: `extension/core/selector-health.js:573` (alias, zero call sites including `tests/`); `extension/core/csv.js:45` (`csvRow`, sole caller `tests/csv-export-safety.test.js:65`); `extension/core/remote-list-scope.js:223` (`describePublicHttpsUrl`, called only from `:191` and `:202` inside its own file).
  Touches: `extension/core/selector-health.js`, `extension/core/csv.js`, `extension/core/remote-list-scope.js`, the corresponding tests.
  Acceptance: the alias is removed, the remaining two are either used by production code or moved behind the module's test entry point, and `npm run check:userscript-symbols` still passes.
  Complexity: S

- [ ] P3 — Correct the Firefox loopback workaround rationale and reconcile the `ws` pin
  Why: the code comment frames a permanent Firefox limitation as a 152-154 regression, inviting someone to revert the workaround, and the installed `ws` does not match its own exact pin.
  Evidence: `scripts/manifest-patch.js:65-68` says "Firefox 152-154 accepts port-qualified host grants"; the real cause is https://bugzilla.mozilla.org/show_bug.cgi?id=1362809, open since 2017 and never fixed, with https://bugzilla.mozilla.org/show_bug.cgi?id=2052000 closed as its duplicate. `package.json` pins `ws` at `8.21.3` while `node_modules/ws` reports `8.21.2`.
  Touches: `scripts/manifest-patch.js`, `docs/architecture.md`, `package-lock.json`.
  Acceptance: the comment cites bug 1362809 and states the workaround is permanent; `npm ci` yields `ws@8.21.3` and `npm run check` stays green.
  Complexity: S

- [ ] P3 — Retire or rewrite `HARDENING.md`
  Why: it documents v3.14.0 through v4.46.0 against a shipped v4.88.2, its line citations no longer resolve, and at least one entry now misstates the current code.
  Evidence: `HARDENING.md:3-4` and `:9-11` self-retract; `:126-128` records `core/trusted-html.js` as a pass-through policy while the file sanitizes through a DOMParser at `:86-118`.
  Touches: `HARDENING.md`, `SECURITY.md`, `docs/architecture.md`.
  Acceptance: the file is either archived with a dated header pointing at `SECURITY.md` and `CHANGELOG.md`, or reduced to currently-true unresolved risks with source-derived citations; no entry contradicts shipped code.
  Complexity: M
