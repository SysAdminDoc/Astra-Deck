# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Research-Driven Additions

### P2

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

## Audit follow-ups (2026-08-25)

Found during a full audit pass, verified, and deliberately not fixed in it.

### P2

- [ ] P2: Give the core userscript bundle real headroom
  Why: `YTKit-core.user.js` is against Greasy Fork's hard 2 MiB cap. Adding one light-theme lane consumed the entire remaining 3.2 KB and the work had to stop and reclaim space before it could finish. Stripping CSS comments from the two already-compacted templates bought 4,434 B back, which is a reprieve rather than a fix: the bundle still carries roughly 269 KB of comments overall (91 block, 2,904 line), and the next feature hits the wall again.
  Where: `sync-userscript.js` (`COMPACT_CSS_TEMPLATES`, `COMPACT_RETURN_CSS_FUNCTIONS`, `COMPACT_LINE_COMMENT_MODULES`), `scripts/check-userscript-size.js`
  Acceptance: decide and implement a durable strategy, then document the headroom it buys. Candidates: extend `COMPACT_LINE_COMMENT_MODULES` beyond `settings-schema.js` now that the CSS precedent exists; move a large rarely-changed module to its own `@require` record; or split the core library in two. Whichever is chosen, `npm run check` must report at least 50 KB of core headroom afterwards, and a test must pin that floor so the next feature fails loudly rather than silently shaving prose.
  Complexity: M

- [ ] P2: Bind the companion's HTTP identity to its native-messaging identity
  Why: the cookie handoff is well guarded (crypto token, one use, 20s TTL, bound to tab/frame/document, requires a fresh `connectNative` proof) but that proof only shows *a* native host is registered. The cookies then go in cleartext to `http://127.0.0.1:<port>/download`, chosen from whoever answers `/health` with `{"service":"astra-downloader"}`, with no shared secret. A local process that binds the port first receives `LOGIN_INFO` and the `SAPISID` family. It needs prior local code execution, which also reaches the cookie DB, so the impact is bounded, but the capability gate advertises a binding it does not enforce.
  Where: `extension/features/download-ui/index.js` (~501-512, 620-660, 1703-1740), `extension/background.js` (~446-506)
  Acceptance: the pairing exchanges a secret over native messaging that the HTTP endpoint must then present, and a squatter that cannot produce it is refused before any cookie leaves the browser.
  Complexity: M

- [ ] P2: Constrain string settings by format and length at the trust boundary
  Why: `clampSettingValue` clamps numbers and coerces enums but returns strings unchanged, and `sanitizeSettingsObject` only filters prototype keys and retired ids. A crafted backup can therefore put arbitrary content in any `type: "string"` setting. Two consequences were fixed individually this pass (the keyword-filter ReDoS and the alternative-frontend open redirect); the class remains. `customCssCode` reaches `style.textContent` verbatim, which is CSS-only but still allows attribute-selector and `background:url()` exfiltration against youtube.com.
  Where: `extension/core/policy-profile.js` `validateSettingsSnapshot` / `isSettingValueValid` / `clampSettingValue`, `extension/core/settings-schema.js`
  Acceptance: the schema carries an optional `pattern` and `maxLength` per string entry, the import path enforces them, and a test feeds a hostile backup at every string key and asserts each one is rejected or clamped rather than stored.
  Complexity: M

- [ ] P2: Make the sync push atomic across its chunk and metadata writes
  Why: `writeRemotePayload` does `setSync(entries)` then `setSync({[SYNC_META_KEY]: ...})` as two calls. Metadata last protects against a torn chunk set, not against the metadata write failing on its own. When it does, the account holds new chunk bytes under old metadata and every other device fails the integrity check with "Browser sync payload is incomplete or corrupt" until some device pushes successfully. `handleLocalChanges` pushes on every relevant local change with no debounce and each push is two or more `setSync` calls, so `MAX_WRITE_OPERATIONS_PER_MINUTE` (120) is reachable by hiding around 60 videos in a minute.
  Where: `extension/core/settings-sync.js` (~555-574, 691, 723)
  Acceptance: a failed metadata write restores the previous chunk set or writes chunks under a staged key that only becomes current with the metadata; `handleLocalChanges` debounces; a test injects a mid-sequence `setSync` failure and asserts peers still read the previous payload.
  Complexity: M

- [ ] P2: Count what the transcript index actually stores, and report its search recall
  Why: `estimateRecordBytes` counts `text` and `title` only. `prepareTranscriptRecord` also stores `searchTerms` (up to 5000 strings of 3 to 80 chars) and `ytkit.js` builds a `multiEntry` index over it, so each term is an index row too. `MAX_TOTAL_BYTES` (64 MB) therefore underestimates the real footprint, which weakens the module's stated purpose of evicting "long before a write can fail". Separately, `buildSearchTerms` fills a Set in document order and breaks at `MAX_SEARCH_TERMS`, so the terms dropped are the ones at the END of a long transcript, and `_search` looks up through `byTerm` only. A query that would match the tail of a 200,000-character transcript silently returns nothing, with no signal to the user.
  Where: `extension/core/transcript-index.js` (~58-67, 86-93, 101-103), `extension/ytkit.js` (~36248, 36302, 36339, 36388)
  Acceptance: the estimate includes the deduped term set and its index rows; the search either falls back to a full-text scan for records whose term set was truncated, or the UI says the index is partial for that video.
  Complexity: M

- [ ] P2: Give the pointer-only controls a keyboard path
  Why: three interactions cannot be performed without a mouse. Element Zapper's picker is `mousemove` plus `click` with Escape as the only key handler, so choosing an element to hide is pointer-gated. The settings sidebar reorder is `draggable` with no `keydown` path, and `sidebarOrder` is a persisted preference a keyboard user simply cannot set. The floating-chat drag handle is a focusable button whose only listener is `pointerdown`, so it announces "Move floating chat, button" and does nothing on Enter or Space.
  Where: `extension/features/element-zapper/index.js` (~256-347), `extension/features/settings-panel/index.js` `addDragReorder` (~582-607), `extension/features/sticky-chat/index.js` (~140-146)
  Acceptance: the zapper can target the focused element and walk the DOM with arrow keys; the sidebar exposes move-up/move-down (a menu or Alt+Arrow) that writes the same `sidebarOrder`; the drag handle moves the panel on arrow keys. `scripts/audit-overlays-a11y.js` covers none of these three modules, so extend it alongside.
  Complexity: M

- [ ] P2: Label Element Zapper's rule rows
  Why: each rule row builds a bare `<input type="checkbox">` with no `aria-label`, no `id` plus `<label for>` and no wrapping `<label>`, inside a plain `<div>`. It announces as "checkbox, not checked" with no indication of which rule it toggles, and the sibling Remove button is just "Remove". Every other checkbox in the extension is either wrapped in a label or carries an explicit `aria-label`; this is the only one that is not.
  Where: `extension/features/element-zapper/index.js` (~422-425)
  Acceptance: the toggle and the remove button both name their rule, and `scripts/audit-overlays-a11y.js` gains element-zapper as a named source.
  Complexity: S

- [ ] P2: Stop the download progress panel talking over everything else
  Why: the panel is `role="status"` with `aria-live="polite"` and `aria-atomic="true"` on the whole panel, and the poll rewrites percent, speed, ETA and status copy every 750 ms. Each poll re-announces the badge, title, state pill, all three numbers and the buttons inside the region, so a five-minute download queues roughly 400 full-panel announcements and the speech queue never drains. Errors such as "needs-auth" also stay polite, so a stalled download never interrupts.
  Where: `extension/features/download-ui/index.js` (~1119-1125, 1259-1283, 1378-1381)
  Acceptance: the live region is a single status line, not the panel; it updates on meaningful transitions rather than every poll; error states are assertive.
  Complexity: S

- [ ] P2: Give the speed popup, context menu, AI Summary panel and persistent queue a real dialog contract
  Why: four overlays declare a role they do not implement. The playback-speed popup is `role="menu"` with 18 `menuitemradio` children, appended to `<body>`, with no `.focus()`, no arrow-key roving tabindex and no focus restore. The Astra context menu is `role="menu"` with no accessible name, no focus entry, no keydown handler at all and no restore, and its `preventDefault()` suppresses the native right-click that its own description says it never blocks. The AI Summary panel and the persistent queue are both `role="dialog"` appended to `<body>` with no Escape, no focus entry and no restore; the queue's `aria-label` is a hardcoded English string.
  Where: `extension/ytkit.js` `showSpeedPopup` (~3200-3323), context menu (~37797-37850), AI Summary panel (~29956-29998), persistent queue (~22366-22409)
  Acceptance: each moves focus in on open, traps it, closes on Escape and restores focus to its trigger; the menus implement the arrow-key model their role promises; the queue label is localized. The Transcript Q&A modal in the same file is the working reference.
  Complexity: M

### P3

- [ ] P3: Normalize the remaining copy inconsistencies in the settings catalog
  Why: the dash and AI-vocabulary sweep is done and gated, but the catalog still disagrees with itself in ways a reader notices. Thirteen `feature_*_name` values are sentence case among 399 Title Case ones; 295 `feature_*_desc` end without a period and 137 with one; the popup and the sidepanel label the same two numbers four different ways ("Keys"/"Storage" against "Customized"/"Size"); playback speed is written `1×` in two strings and `1x` everywhere else; `bisectIntro` hardcodes "291" features when the catalog now defines 432; and seven strings use the `(s)` plural hack while the catalog elsewhere ships proper singular/plural key pairs.
  Where: `extension/_locales/en/messages.json`, `extension/popup.html` (`bisectIntro` is inlined there too)
  Acceptance: one pass over the `feature_*` block, the stat labels aligned across both surfaces, the count derived from the live registry rather than baked in, and the `(s)` strings given real plural pairs. Changing shipped English means re-running `generate-locales.js` and ratcheting both i18n baselines.
  Complexity: S

- [ ] P3: Replace the popup's five em-dash stat cards with a real empty state
  Why: `popup.html` seeds Keys, Storage, Hidden, Blocked and Bookmarks with a bare `—`, and `popup.js` writes the same `—` back whenever storage is unavailable. So the first thing a user sees is five dashes, and when storage genuinely fails they see five dashes and no explanation. The catalog already contains `spStatUnavailable` ("Unavailable") for exactly this and it is unused on the popup surface.
  Where: `extension/popup.html` (~137-153), `extension/popup.js` (~2385-2389)
  Acceptance: the cards seed at `0`, and the failure path shows the unavailable state plus the existing recovery copy rather than a placeholder glyph.
  Complexity: S

- [ ] P3: Fix the two remaining unactionable error messages
  Why: `selectorHealthCopyFail` tells a non-developer to "Open DevTools and call window.__ytkitDiagnostics.download()", and leaks the retired `ytkit` brand; the very next key, `selectorHealthCopySaveFallback`, already handles the identical situation properly. `statusMediadlReenableFail` says "Open chrome://extensions and reload" in an extension that ships a Firefox sidebar.
  Where: `extension/_locales/en/messages.json`
  Acceptance: the first reuses its working sibling's wording, the second names the browser's extensions page without hardcoding a Chrome URL.
  Complexity: S

- [ ] P3: Abort in-flight oEmbed lookups on teardown
  Why: the thumbnail lookups no longer throw or restyle after `destroy()`, but the `fetch` still has no `AbortController` and no timeout, so a feature that has been switched off leaves requests running to completion. `enableHandleRevealer` in the same file already keeps a `_requestControllers` set for this.
  Where: `extension/ytkit.js` `antiTranslateThumbnails._lookupOEmbed` (~34082-34112)
  Acceptance: each lookup carries a signal, destroy aborts them all, and an aborted lookup is not cached as a miss.
  Complexity: S
