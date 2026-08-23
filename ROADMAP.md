# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Research-Driven Additions

### P1

- [ ] P1: Generate truthful store-review resource documentation from staged manifests
  Why: reviewer documents currently say no JavaScript is web-accessible, while the runtime loader and full module graph are intentionally listed in `web_accessible_resources`; the test suite pins both contradictory claims.
  Evidence: `extension/manifest.json`; `docs/cws-submission-checklist.md`; `docs/store-permission-rationale.md`; `tests/hardening.test.js`; [Chrome web-accessible resources security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
  Touches: `build-extension.js`, `scripts/project-facts.js` or a focused reviewer-copy generator, both store documents, `tests/hardening.test.js`
  Acceptance: each build profile's staged manifest drives an exact reviewer-facing resource inventory; the documents explain why runtime modules are exposed and how `use_dynamic_url` limits stable fingerprinting; a bait test fails if either a staged resource or the prose changes alone; no document claims that JavaScript is absent.
  Complexity: M

- [ ] P1: Make the shipped-identity gate invariant across release tagging
  Why: creating tag `v4.84.3` made `npm run check` fail even though no setting key or feature ID changed, so a successful release leaves the main verification command red.
  Evidence: `scripts/generate-shipped-identity-baseline.js`, `scripts/shipped-identity-baseline.json`, `tests/feature-identity-aliases.test.js`, and the 2026-08-23 `npm run check` result
  Touches: `scripts/generate-shipped-identity-baseline.js`, `scripts/check-settings.js`, `tests/feature-identity-aliases.test.js`, release preparation scripts
  Acceptance: adding a tag that points at an already-checked commit does not change the committed identity baseline or fail `npm run check`; a tagged release that introduces a setting or feature ID still adds that identity; removing or renaming a shipped identity without an alias or retirement still fails; tests cover pre-tag and post-tag states.
  Complexity: M

- [ ] P1: Rebuild Transcript Q&A on citation-backed artifacts and accessible dialog behavior
  Why: the shipped Q&A path uses only the first 6,000 transcript characters, returns unvalidated plain text, has no citations or saved history, and uses hard-coded English in a hand-rolled modal without a complete focus cycle.
  Evidence: `extension/ytkit.js` `localAiTranscriptQa`; `extension/core/ai-summary-artifacts.js`; [Glasp YouTube Summary](https://glasp.co/youtube-summary); [YouTube Ask help](https://support.google.com/youtube/answer/14110396)
  Touches: the Q&A feature in `extension/ytkit.js` or a peeled feature module, `extension/core/ai-summary-artifacts.js`, `extension/core/persisted-domains.js`, settings schema, data-flow declarations, locales, rendered feature tests
  Acceptance: questions run against bounded cue chunks rather than `slice(0, 6000)`; every rendered claim cites one or more validated transcript cue IDs with seekable timestamps; conversations reopen by video, transcript language, provider, model, and prompt version; Chrome on-device, Ollama, and permitted BYO-key lanes honor existing spend, permission, and privacy policies; the dialog is localized, traps focus, closes on Escape, restores focus, reports busy/error state, and passes rendered dark, light, keyboard, and screen-reader checks.
  Complexity: L

### P2

- [ ] P2: Remove the final subscription-groups implementation fallback from the monolith
  Why: the running factory and a 164 KB inline fallback still duplicate behavior and tests, so a fix can land in one copy while the other silently drifts.
  Evidence: `extension/ytkit.js`, `extension/features/subscription-groups/index.js`, `tests/features/next-monolith-peel.test.js`, startup stage output
  Touches: `extension/ytkit.js`, subscription-groups feature module, runtime bootstrap, userscript sync, source-audit and feature tests
  Acceptance: reconcile both implementations line by line, replace the fallback with a descriptor-only stub, repoint or replace every test with assertions on the running module, bait-verify the a11y and light-theme gates, sync userscripts, and record an interleaved before/after startup measurement with no behavior loss.
  Complexity: L

- [ ] P2: Replace source-shape UI tests with rendered assertions across remaining feature modules
  Why: source pins can pass while a feature appends to the wrong node, keeps duplicate children, or never renders; the shared DOM harness now supports real tree assertions.
  Evidence: `tests/features/watch-later-workbench.test.js`, `tests/helpers/`, `tests/features/feature-render-surfaces.test.js`, and the existing render-assertion conversions
  Touches: UI-building tests under `tests/features/`, shared DOM test helpers, obsolete source-pin tests
  Acceptance: inventory every feature test that exercises a UI builder, convert each remaining render half to assertions on nodes, copy, state, and teardown, delete the superseded source pins, and bait-verify each conversion by directing one render into the wrong node.
  Complexity: M

- [ ] P2: Add native YouTube Theater to watch-theme conformance
  Why: live theme coverage verifies normal watch and Astra Theater Split in dark and light, but never toggles YouTube's distinct native Theater or full-bleed layout, where current experiments change scrolling, comments access, and player geometry.
  Evidence: `scripts/smoke-zero-ads-live.js`; `README.md`; [YouTube player sizing](https://support.google.com/youtube/answer/6052392); [full-bleed report](https://www.reddit.com/r/youtube/comments/1nb5pcc); [Theater experiment report](https://www.reddit.com/r/youtube/comments/1oidrvv)
  Touches: watch-theme CSS in `extension/ytkit.js` and `extension/features/chat-style-comments/index.js`, Theater Split coexistence rules, `scripts/smoke-zero-ads-live.js`, theme tests, README screenshots
  Acceptance: the smoke toggles the native size control independently of Theater Split and captures native Theater in dark and light; it asserts readable metadata, comments, related rail or live chat, usable scrolling, non-overlapping player geometry, and theme tokens on `#full-bleed-container` variants; switching normal, native Theater, and Theater Split repeatedly leaves no stale classes or inline geometry.
  Complexity: M

- [ ] P2: Require dated screen-reader evidence for UI-changing releases
  Why: static a11y gates cannot prove announcement order, focus restoration, or Blink-versus-Gecko behavior, and the current NVDA, JAWS, and VoiceOver checklist has no completed evidence record.
  Evidence: `docs/screen-reader-smoke.md`, `scripts/audit-overlays-a11y.js`, `scripts/generate-release-readiness.js`, [NVDA](https://www.nvaccess.org/download/)
  Touches: screen-reader checklist, a structured evidence schema and validator under `scripts/`, release-readiness report, tests
  Acceptance: a dated record captures Astra version, browser version, assistive technology version, surface, expected announcement, observed announcement, and pass/fail; the first record covers popup, settings, Theater Split, Transcript Q&A, and one provider degradation in Chrome and Firefox with NVDA; release readiness rejects missing or stale evidence when those surfaces change, while allowing an explicit documented not-applicable result for JAWS or VoiceOver.
  Complexity: M

- [ ] P2: Gate semantic documentation claims against runtime sources
  Why: generated fact blocks are current, but nearby prose still says Node 22, calls the popup the only settings surface, describes dark/OLED as the only themes, overstates route gating, and claims release attestation that the local release path does not publish.
  Evidence: `CONTRIBUTING.md`, `README.md`, `docs/architecture.md`, `scripts/project-facts.js`, `package.json`, `extension/runtime-bootstrap.js`, release manifest and signature scripts
  Touches: `scripts/project-facts.js` or focused semantic-claim checks, affected documentation, project-facts tests
  Acceptance: correct the five verified contradictions; derive or validate the Node floor, settings surfaces, theme modes, module-loading semantics, and release provenance from source; bait tests fail when each source value or its documented claim changes alone.
  Complexity: M

- [ ] P2: Key selector health to YouTube builds and add a critical-surface canary
  Why: per-selector telemetry exists, but failures are not correlated to `INNERTUBE_CLIENT_VERSION` and users receive no single warning when a YouTube deployment breaks several critical surfaces together.
  Evidence: `extension/core/selector-health.js`, `extension/core/transcript-service.js`, `extension/core/selector-packs/**`, 2026 view-model and template migrations in [ImprovedTube](https://github.com/code-charity/youtube), [DeArrow](https://github.com/ajayyy/DeArrow), and [Invidious](https://github.com/iv-org/invidious)
  Touches: selector health, selector packs, feature health payload, popup or in-page degradation notice, selector fixtures
  Acceptance: selector snapshots include the active YouTube client version; startup probes a bounded set of critical surfaces after route settle; aggregate failure names affected features once, links to diagnostics, and does not spam per selector; fixtures cover a camelCase view-model host, mixed children, template-stamped content, and a hidden prior-route tree.
  Complexity: M

- [ ] P2: Finish popup visibility and corruption recovery for the transcript index
  Why: backup/import now includes transcript records, but popup storage totals still exclude YouTube-origin IndexedDB and a corrupted store has no export-before-clear recovery.
  Evidence: `extension/popup.js` `renderStorageInfo`, `extension/core/persisted-domains.js` `transcriptIndex`, transcript-index stats and smoke tests
  Touches: `extension/popup.js`, content-script persisted-data messages, `extension/core/persisted-domains.js`, transcript index helpers and tests
  Acceptance: the popup reports transcript count and bytes beside extension-local storage by querying a responsive YouTube tab and explains when none is available; corruption offers bounded export-before-clear; export failure never clears data; tests cover unavailable tab, malformed store, successful export, failed export, and recovery clear.
  Complexity: M

- [ ] P2: Turn anti-adblock detection into evidence-based, reversible recovery
  Why: SponsorBlock currently logs a matching YouTube enforcement selector, but users get no plain-language state or safe session recovery when playback is degraded.
  Evidence: `extension/features/sponsorblock/index.js` `sb-anti-adblock`; `extension/core/feature-health.js`; [YouTube help](https://support.google.com/youtube/answer/14129599); [Adblock Plus help](https://help.adblockplus.org/adblock-plus-help-center/what-to-do-if-you-are-seeing-youtube-s-anti-adblocking-warning)
  Touches: SponsorBlock detection, feature health, popup or in-page recovery UI, session storage or alarms, locales, tests
  Acceptance: structural signals identify a visible enforcement warning and confirm whether playback is advancing, stalled, or blocked without dismissing native dialogs; uncertain stalls remain labeled unknown rather than blamed on YouTube; health UI reports the observed selector and playback state; a user action can pause Astra's ad rules for the current session and auto-restore after a visible deadline; detection never changes policy automatically.
  Complexity: M

- [ ] P2: Add per-surface enable masks for network-backed enrichment
  Why: users should be able to exclude costly or unwanted surfaces such as playlists without disabling DeArrow, SponsorBlock, or Return YouTube Dislike everywhere.
  Evidence: [DeArrow issue #92](https://github.com/ajayyy/DeArrow/issues/92), [DeArrow issue #423](https://github.com/ajayyy/DeArrow/issues/423), and `extension/core/selectors.js` surface attribution
  Touches: settings schema, settings panel, DeArrow, SponsorBlock, Return YouTube Dislike, rule registration, data-flow display, locales
  Acceptance: at least DeArrow supports explicit watch, related, home, search, subscriptions, and playlist masks; excluded surfaces register no observer and fire no fetch; defaults keep all current surfaces enabled; import/export, userscript classification, and per-channel overrides compose predictably.
  Complexity: M

### P3

- [ ] P3: Adopt platform APIs only where capability probes delete code
  Why: current browser floors cannot assume 2026 APIs, but feature-detected adoption can remove lifecycle, state-mirroring, and compatibility code without a forced floor increase.
  Evidence: `extension/core/capability-probe.js`; [Chrome extension updates](https://developer.chrome.com/docs/extensions/whats-new); [Chrome browser namespace](https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace); [Firefox 153](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153); [Firefox 154](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154)
  Touches: browser API shim, injection guard, live-chat styling, MAIN-world player state, capability matrix, build-for-AMO path
  Acceptance: evaluate `runtime.getContexts`, native `browser`, media-state pseudo-classes, `documentId`, content-script `adoptedStyleSheets`, and Firefox `sandbox` independently; adopt only APIs that remove more compatibility code than they add; every path has a probe and tested fallback at Chrome 120 and Firefox 142; startup does not regress.
  Complexity: M

- [ ] P3: Update ESLint from 10.6.0 to 10.9.0
  Why: ESLint is the only outdated direct dependency found on 2026-08-23, and the upgrade is isolated to development tooling.
  Evidence: `package.json`; [ESLint v10.9.0](https://github.com/eslint/eslint/releases/tag/v10.9.0)
  Touches: `package.json`, `package-lock.json`, lint configuration only if new diagnostics require a justified code fix
  Acceptance: install ESLint 10.9.0, review its release changes, run the full lint target and `npm test`, add no blanket disables or new warning suppressions, and keep the production dependency tree unchanged.
  Complexity: S
