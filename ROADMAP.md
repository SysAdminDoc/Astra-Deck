# Roadmap - Astra Deck

## Research-Driven Additions

- [ ] P2 — Promote subscription groups into a health/action center
  Why: PocketTube-level subscription management includes health status, dead-channel detection, bulk unsubscribe, mark-watched, notifications, and Deck-style triage; Astra already has the local data needed but not a unified workflow.
  Evidence: PocketTube feature pages, `extension/features/subscription-groups/index.js`, `extension/core/settings-schema.js`.
  Touches: `extension/features/subscription-groups/index.js`, `extension/features/settings-panel/index.js`, `extension/core/settings-schema.js`, `tests/features/`, `tests/hardening.test.js`.
  Acceptance: Subscriptions page exposes one coherent health panel showing stale/dead candidates, new-since-last-visit counts, staged unsubscribe recovery, export actions, and clear empty/error states.
  Complexity: L

- [ ] P2 — Add recoverable recommendation scrub sessions
  Why: Research and YouTube help show "Not interested" and "Don't recommend channel" can tune recommendations, but users under-discover them and Astra only exposes one-off thumbnail actions today.
  Evidence: arXiv recommender study, YouTube Help recommendation controls, `notInterestedButton`, `extension/features/video-hider/index.js`.
  Touches: `extension/features/video-hider/index.js`, `extension/features/settings-panel/index.js`, `extension/core/settings-schema.js`, `tests/features/`, `tests/hardening.test.js`.
  Acceptance: Users can start a bounded scrub session from Home/Watch recommendations, review queued cards/channels, apply native "Not interested" or "Don't recommend channel" actions where available, undo local hides, and export a scrub summary without sending data off-device.
  Complexity: L

- [ ] P2 — Add rendered visual smoke coverage for the in-page settings overlay
  Why: Static a11y/theme audits cannot prove the large settings window actually renders as premium software across desktop/mobile, theme, RTL, and nested modal states.
  Evidence: `extension/features/settings-panel/index.js`, `scripts/audit-overlays-a11y.js`, `tests/ux-theming-fixes.test.js`, prior settings command-deck polish commits.
  Touches: `scripts/`, `tests/`, `extension/features/settings-panel/index.js`, `extension/core/selector-packs/settingsOverlay.js`.
  Acceptance: A local smoke opens the extension settings overlay in a browser-backed YouTube/fixture surface, captures desktop and mobile screenshots for dark/light/RTL states, and fails on blank render, overflow, missing close/focus target, or unreadable primary controls.
  Complexity: M

- [ ] P2 — Surface in-page degraded states for SponsorBlock, DeArrow, and RYD
  Why: Popup and sidepanel expose external API health, but users watching a video need immediate context when skips, title replacements, or dislike estimates are cached, stale, rate-limited, or unavailable.
  Evidence: SponsorBlock/DeArrow/RYD competitors, `extension/core/external-api-health.js`, `extension/features/sponsorblock/index.js`, `extension/features/dearrow/index.js`, `extension/features/return-dislike/index.js`.
  Touches: `extension/core/external-api-health.js`, `extension/features/sponsorblock/index.js`, `extension/features/dearrow/index.js`, `extension/features/return-dislike/index.js`, `tests/external-api-health.test.js`.
  Acceptance: Watch-page UI shows compact service-state feedback only when actionably degraded, includes cache age/retry reason, respects reduced-motion and theme contrast, and disappears after recovery.
  Complexity: M

- [ ] P2 — Introduce a cross-browser extension API wrapper
  Why: Chrome 148 adds `browser.*` while Firefox already uses it, but Astra still calls `chrome.*` directly across popup, sidepanel, background, and core modules.
  Evidence: Chrome browser namespace docs, MDN Chrome incompatibilities, `extension/popup.js`, `extension/sidepanel.js`, `extension/background.js`.
  Touches: `extension/core/`, `extension/popup.js`, `extension/sidepanel.js`, `extension/background.js`, `tests/hardening.test.js`, `eslint.config.js`.
  Acceptance: New code imports a small wrapper for storage/runtime/tabs/permissions/downloads, existing direct calls are migrated in bounded batches, and tests cover Chrome-only and Firefox-style namespace availability.
  Complexity: L

- [ ] P3 — Enable ESLint constant-binary-expression relational checks
  Why: ESLint 10.6.0 can catch always-constant relational comparisons, a low-cost correctness ratchet for Astra's large plain-JS codebase.
  Evidence: ESLint 10.6.0 release notes, `eslint.config.js`, `package.json`.
  Touches: `package.json`, `package-lock.json`, `eslint.config.js`, `tests/hardening.test.js`.
  Acceptance: Lint enables `no-constant-binary-expression` with `checkRelationalComparisons`, the suite stays green, and any newly discovered constant comparisons are fixed rather than suppressed.
  Complexity: S

## Audit Backlog (v4.46.35)

- [ ] P2 — Throttle watchTimeTracker storage writes
  Why: The watch time tracker writes to chrome.storage.local every 10 seconds while any video plays (6 writes/min). chrome.storage.local has a throughput limit of ~120 writes/min, and this consumes 5% of the budget for a single feature.
  Where: `extension/ytkit.js` (watchTimeTracker._tick)

- [ ] P2 — Throttle Reaction Spammer mutation observer
  Why: The full-document MutationObserver calls `_restoreReactionButton()` + `_scheduleRender()` on every DOM mutation with no throttle. On busy live chat pages this fires hundreds of times per second.
  Where: `extension/ytkit.js` (reactionSpammer observer)

- [ ] P2 — Reduce video-hider _removedVideoNodes DOM retention
  Why: Up to 500 detached DOM subtrees (including thumbnails and metadata) are held in memory via strong references. `nextSibling` references can anchor entire subsequent card subtrees.
  Where: `extension/features/video-hider/index.js` (_removedVideoNodes)

- [ ] P3 — Guard sync-userscript against bundled modules containing END marker
  Why: If any module in V5_BUNDLE_MODULES contains the END marker string, the next sync run's regex would match a truncated region, corrupting the userscript.
  Where: `sync-userscript.js`

- [ ] P3 — Handle template literal expressions in check-no-eval scanner
  Why: `stripStringLiteralContents` treats backtick strings as simple quotes, so `eval()` inside `${}` template expressions would be missed.
  Where: `scripts/check-no-eval.js`
