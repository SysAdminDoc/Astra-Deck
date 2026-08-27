# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Research-Driven Additions

Sourced from the 2026-08-27 research pass. Evidence and reasoning: `RESEARCH.md`.

- [ ] P0 — Run the test suite inside `release:prepare`
  Why: no npm script invokes `npm test`, there are no git hooks and no CI, so 12,602 assertions across 216 files enforce nothing automatically.
  Evidence: `package.json:19` (`release:prepare` chain omits `test`); `.git/hooks/` contains only `.sample` files; no `.github/workflows/`.
  Touches: `package.json` (`release:prepare`, `release:prepare:no-crx`), `CONTRIBUTING.md` §Verification.
  Acceptance: `npm run release:prepare` fails when any test fails; introducing a deliberately failing test aborts the chain before `build:userscript` runs.
  Complexity: S

- [ ] P0 — Authenticate both remote feeds with a detached signature
  Why: the two documents that can change shipped behavior without a release carry no authenticity check, so anyone who can write the repository or intercept the CDN can pause features or replace selectors on every install.
  Evidence: `extension/core/feature-disable-feed.js` contains no `sha256`, `digest`, `signature`, or `integrity` check at all — only the origin allowlist and 1 MiB cap in `extension/background.js:1003`. The selector asset does verify a digest (`extension/core/selectors.js:338`, `:415`), but the expected value is parsed out of the same fetched document, so it detects truncation and corruption rather than substitution. Remote config as an unreviewed update channel is a named 2026 abuse pattern (https://thehackernews.com/2026/08/737-chrome-vpn-extensions-caught.html) and Chrome permits remote config only when all logic ships in the package (https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).
  Touches: `extension/core/feature-disable-feed.js`, `extension/core/selectors.js`, `extension/background.js`, `scripts/build-selector-asset.js`, `scripts/generate-release-manifest.js`, `docs/store-permission-rationale.md`, `SECURITY.md`.
  Acceptance: both feeds ship a detached signature verified against a public key embedded in the extension package; a payload with a missing, malformed, or non-matching signature is rejected and the last-known-good state is retained; a test feeds a tampered payload past the digest check and asserts it is refused.
  Complexity: L

- [ ] P0 — Enforce Trusted Types on extension pages and gate every HTML sink
  Why: `core/trusted-html.js` builds a real sanitizing policy but nothing makes it mandatory, and only three ad-hoc per-file regexes stop a new `innerHTML =` from appearing.
  Evidence: `extension/core/trusted-html.js:9-29` creates `trustedTypes.createPolicy('astraDeck', …)`; `extension/manifest.json` `extension_pages` has no `require-trusted-types-for 'script'`; the only guards are `tests/hardening.test.js:1627`, `:2873` and `tests/bugfix-validation.test.js:1686`. YouTube has enforced the directive on its own pages since 2024-07-25 (https://developer.chrome.com/blog/trusted-types-on-youtube), which is the vehicle the page-context userscript runs in.
  Touches: `extension/manifest.json`, `build-extension.js`, `scripts/check-no-eval.js` (or a sibling `check-no-html-sinks.js`), `scripts/run-checks.js`, `extension/popup.html`, `extension/sidepanel.html`.
  Acceptance: staged manifests carry `require-trusted-types-for 'script'`; popup and side panel load and operate with no Trusted Types violation in the console; a new gate fails on any `innerHTML`/`outerHTML`/`insertAdjacentHTML` assignment outside `core/trusted-html.js`.
  Complexity: M

- [ ] P0 — Make release currency a blocking gate and tag the outstanding releases
  Why: 67 commits and 13 releases including the 4.85.1 cookie-handoff security fix are unshipped while every channel serves 4.82.0, and `npm run check` stays green.
  Evidence: `scripts/run-checks.js:30` calls `check-versions.js` without `--require-release-current`; `release-channels.json` shows `active: 4.82.0` on all five channels; `git tag --list | sort -V | tail -1` is `v4.84.3`; `git rev-list v4.84.3..HEAD --count` is 67.
  Touches: `scripts/run-checks.js`, `release-channels.json`, `CHANGELOG.md`.
  Acceptance: `npm run check` fails while any channel trails the newest tag; the GitHub-full and userscript channels are promoted to the current version with digests verified by `npm run release:channels`. Store channels stay governed by the submission items in `Roadmap_Blocked.md`.
  Complexity: M

- [ ] P1 — Gate selector-evidence age and stamp capture provenance into generated fixtures
  Why: all 35 surfaces claim `needsFreshCapture: false` on evidence dated 2026-05-19 to 2026-07-14, 28 of them flagged high-churn, and the only assertion checks the date's format.
  Evidence: `extension/core/selector-packs/*.js` `lastVerified` values; `tests/hardening.test.js:9033-9034` asserts only `^\d{4}-\d{2}-\d{2}$`; `tests/fixtures/yt-*.tokens.txt` headers carry no date or client version while `tests/fixtures/critical-selector-canary.json:2` records `2.20260820.01.00`.
  Touches: `scripts/build-selector-fixtures.js`, `extension/core/selector-packs/*.js`, `scripts/run-checks.js`, `tests/hardening.test.js`, `docs/selector-fixture-workflow.md`.
  Acceptance: every generated token fixture header records its capture date and `INNERTUBE_CLIENT_VERSION`; a gate fails when a `highChurn` surface's `lastVerified` is older than a declared threshold or older than the canary's recorded client version, and names the surfaces to recapture.
  Note: this is the local detection half only. The live recapture it will demand is the browser-gated "Selector fixture refresh for Delhi Modern player" item in `Roadmap_Blocked.md`; this item makes that debt visible rather than performing the capture.
  Complexity: M

- [ ] P1 — Record which selector tier resolved and report stable-chain erosion
  Why: a surface whose stable selector broke but whose fallback still matches is reported healthy, so 28 high-churn surfaces can degrade invisibly until the fallback also breaks.
  Evidence: `extension/core/selector-health.js:118-143` (`findActiveSelectorMatch` returns `{node, selector}` from a flat stable-then-fallback list with no tier); `extension/core/feature-health.js:97-99` (`isSurfaceBroken` is `lastOutcome === 'miss'`).
  Touches: `extension/core/selector-health.js`, `extension/core/feature-health.js`, `extension/popup.js`, `extension/popup.html`, `tests/selector-health.test.js`, `tests/feature-health.test.js`.
  Acceptance: health rows distinguish `stable` from `fallback` resolution; a surface resolving only through fallback reports `degraded` with the surface named; a behavioral test drives a fixture where the stable selector is removed and asserts the degraded state.
  Complexity: M

- [ ] P1 — Convert the 14 zero-behavior test files to executed assertions
  Why: 40.4% of all assertions pin source text, and 14 files carry no behavioral coverage at all, against a helper that documents a real bug shipping past a source pin that matched the broken code exactly.
  Evidence: measured 5,086/12,602 source-shape assertions; 100%-source files led by `tests/userscript-parity.test.js` (55/55), `tests/userscript-fixes.test.js` (40), `tests/regression-deep-pass-3.test.js` (19), `tests/features/link-hygiene.test.js` (17), `tests/speed-popup-placement.test.js` (17), `tests/feature-module-resilience.test.js` (16), `tests/download-popup-navigation.test.js` (13); rationale at `tests/helpers/monolith.js:3-7`.
  Touches: the 14 named files, `tests/helpers/monolith.js`, `tests/helpers/source.js`.
  Acceptance: each converted file loads its subject through `tests/helpers/monolith.js` or `require` and asserts observable output; every converted assertion is validated by reverting the code under test and confirming the test goes red.
  Complexity: L

- [ ] P1 — Correct the five stale claims in `docs/architecture.md`
  Why: the trust-boundary section names 8 content-to-background message types while 25 are handled, including the native token, AI credential, and cookie-handoff channels a reviewer would most want listed.
  Evidence: `docs/architecture.md:30` versus `extension/background.js:1731` and the verified presence of `NATIVE_MSG_GET_TOKEN`, `YTKIT_AI_CREDENTIAL_SET`, `YTKIT_AI_CREDENTIAL_DELETE`, `YTKIT_COOKIE_HANDOFF`, `YTKIT_REPLACE_SETTINGS`, `YTKIT_REQUEST_OPTIONAL_HOSTS`; `:146` says 1,330 tests against ~2,814; `:132` says 6 CSS-only modules while `:14` says 27; `:71` lists 4 popup-bundled core modules while `extension/popup.html` loads 15; `:118` describes a popup path through `rankSelectorProblems`, which `extension/popup.js` never calls.
  Touches: `docs/architecture.md`, `scripts/check-versions.js` (documentation-truth checks).
  Acceptance: each of the five claims is source-derived or corrected, and the documentation-truth gate fails when the message-type list or the module counts drift from source again.
  Complexity: M

- [ ] P1 — Implement offline and reconnect handling
  Why: nothing in the extension observes connectivity, so every network-backed surface fails with a generic error and never recovers on reconnect.
  Evidence: zero `addEventListener('online'|'offline')` across `extension/`; `navigator.onLine` read once at `extension/core/failure-copy.js:99`.
  Touches: `extension/core/failure-copy.js`, `extension/core/external-api-health.js`, `extension/background.js`, `extension/popup.js`, `extension/sidepanel.js`, `extension/features/download-ui/index.js`.
  Acceptance: going offline shows a degraded state naming connectivity as the cause on the popup, side panel, and enrichment surfaces; returning online re-checks provider health without a reload; a test simulating `offline` then `online` asserts both transitions.
  Complexity: M

- [ ] P1 — Give settings operations a live region
  Why: save, import, export, and sync produce no announcement, and the toast peel is explicitly blocked on this primitive.
  Evidence: zero `aria-live`/`role="status"` in `extension/core/settings-controller.js`, `settings-sync.js`, `settings-import-transaction.js`, and `features/subscription-groups/index.js`; `extension/core/toast.js:13-17` names the missing "live-region overlay primitive" as the reason the toast DOM layer stayed in the monolith.
  Touches: `extension/core/toast.js`, `extension/core/toast-dom.js`, `extension/core/settings-controller.js`, `extension/core/settings-sync.js`, `extension/core/settings-import-transaction.js`, `extension/ytkit.js`.
  Acceptance: one shared polite live region announces settings save, import, export, and sync outcomes in the overlay and the popup; `scripts/audit-overlays-a11y.js` asserts its presence; the toast DOM layer moves out of `ytkit.js` behind the same primitive.
  Complexity: M

- [ ] P1 — Correct the false signed-manifest claim in the README
  Why: the README promises a signed release manifest on every build while the signing lane is inert and no published artifact carries a signature.
  Evidence: `README.md:1102`; `allowed-signers:22` ("No release signing key is published yet"); `scripts/release-signature.js:139-144` returns `no-published-key`; `scripts/generate-release-readiness.js:453-456` downgrades it to a warning; no `SHA256SUMS.sig` on v4.82.0 or v4.84.3.
  Touches: `README.md`, `scripts/check-versions.js`.
  Acceptance: the README describes what releases actually carry (SBOM plus an unsigned `SHA256SUMS` and `release-manifest.json`) and the documentation-truth gate fails if the signing claim reappears before `allowed-signers` holds a key. The key publication itself stays in `Roadmap_Blocked.md`.
  Complexity: S

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

- [ ] P2 — Pin the userscript `@require` to an immutable ref
  Why: every userscript install pulls 1.9 MB from a mutable branch pointer in a script that also grants `GM_xmlhttpRequest` to three AI providers and loopback.
  Evidence: `YTKit.user.js:19` requires `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js`; grants at `YTKit.user.js:11-27`.
  Touches: `YTKit.user.js`, `sync-userscript.js`, `scripts/check-userscript-drift.js`, `docs/signing-keys.md`.
  Acceptance: the `@require` URL resolves to a tag or commit SHA that the release process advances in lockstep with `@version`; a gate fails when the required ref is a branch name.
  Complexity: S

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

- [ ] P2 — Require captured, non-synthetic evidence for the startup budget
  Why: the strong budget depends on gitignored MHTML captures, so anyone else's `npm run check` silently measures the weaker synthetic fixture, and the recorded baseline predates 67 commits.
  Evidence: `scripts/run-checks.js:48` passes `--allow-synthetic`; `.gitignore:6` ignores `*.mhtml`; `scripts/bench-startup.js:1022-1024` documents the fallback; `scripts/startup-performance-baseline.json` records `2026-08-22T22:11:03.558Z`.
  Touches: `scripts/run-checks.js`, `scripts/bench-startup.js`, `scripts/startup-performance-baseline.json`, `package.json`, `docs/selector-fixture-workflow.md`.
  Acceptance: the release chain runs `check:startup:captured`, the baseline records the commit it was captured at, and a run that falls back to synthetic prints which fixtures are missing and how to capture them.
  Complexity: S

- [ ] P2 — Gate the install-script refusal that currently rests on an untracked convention
  Why: `.npmrc` is the only thing standing between this tree and the lifecycle-hook vector it was written to stop, and deleting it or passing `--ignore-scripts=false` once is invisible to every gate.
  Evidence: `.npmrc` sets `ignore-scripts=true` and names the 2026-08-04 ChainDrop worm as the reason (https://www.stepsecurity.io/blog/chaindrop-npm-worm); no gate in `scripts/run-checks.js` reads it. `grep -c hasInstallScript package-lock.json` is 0, so the stronger invariant is free to assert now.
  Touches: `scripts/audit-dependencies.js`, `scripts/run-checks.js`, `.npmrc`.
  Acceptance: a gate fails when `.npmrc` no longer sets `ignore-scripts=true` or when any `package-lock.json` entry declares `hasInstallScript`, and names the offending package.
  Complexity: S

- [ ] P2 — Check `sender.origin` on privileged message types
  Why: the background worker authenticates the extension but not the page, so every privileged handler trusts any frame the extension can reach rather than only YouTube.
  Evidence: `extension/background.js:1749-1752` validates `sender.id === ext.runtime.id` and nothing checks `sender.origin`; the github-full profile can hold a runtime grant for an arbitrary user-typed HTTPS origin (`extension/core/data-flow.js:258-278`). The privileged types are `NATIVE_MSG_GET_TOKEN`, `YTKIT_COOKIE_HANDOFF`, `YTKIT_AI_CREDENTIAL_SET`, `YTKIT_AI_CREDENTIAL_DELETE`, `YTKIT_REPLACE_SETTINGS`, and `YTKIT_REQUEST_OPTIONAL_HOSTS`.
  Touches: `extension/background.js`, `extension/core/data-flow.js`, `tests/hardening.test.js`.
  Acceptance: those six message types are refused unless `sender.origin` is a YouTube origin the manifest already matches; a test asserts each is rejected from a non-YouTube sender while the existing YouTube paths still succeed.
  Complexity: M

- [ ] P2 — Harden the MAIN-world bridge against forged page events and attributes
  Why: the bridge takes both its commands and its data from channels any page script can write, so YouTube-origin script or an injected third party can drive it.
  Evidence: `extension/ytkit-main.js:8-10` defines the `documentElement` attribute channel read at `:569`, `:737`, `:759`; the bridge additionally reacts to `yt-navigate-finish`, `yt-page-data-updated`, and `loadedmetadata`, all of which a page script can `dispatchEvent`. Reachable impact today is limited to playback quality and codec strings (`ytkit-main.js:766`), which is why this is P2 rather than P0.
  Touches: `extension/ytkit-main.js`, `extension/core/player.js`, `tests/ytkit-main.test.js`.
  Acceptance: the bridge captures the DOM and JSON natives it depends on at `document_start` before page script runs, and ignores attribute writes and events that do not carry a per-page token generated by the isolated-world side; a test dispatching a forged `yt-navigate-finish` and a forged attribute write asserts both are ignored.
  Complexity: M

- [ ] P2 — Put a coverage floor under the test suite
  Why: the suite's weakness is measured but nothing prevents it widening, and Node 24 ships the thresholds needed to hold the line while the source-shape conversion proceeds.
  Evidence: `package.json:96` runs bare `node --test` with no coverage flags; 40.4% of assertions never execute the code they describe (see `RESEARCH.md`). Node 24 supports `--test-coverage-lines`, `--test-coverage-branches`, and `--test-coverage-functions`.
  Touches: `package.json`, `scripts/run-checks.js`, `CONTRIBUTING.md`.
  Acceptance: `npm test` reports line, branch, and function coverage and fails below a threshold recorded from the current measured value; the threshold is a ratchet that may only be raised.
  Complexity: S

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

- [ ] P3 — Raise `MIN_GATES` to match the shipped gate count
  Why: the floor that exists to make gate deletion deliberate currently permits five deletions in silence.
  Evidence: `scripts/run-checks.js:62` sets `MIN_GATES = 29` against 34 registered gates.
  Touches: `scripts/run-checks.js`, `tests/run-checks.test.js`.
  Acceptance: `MIN_GATES` equals the current gate count and a test asserts the two stay equal.
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
