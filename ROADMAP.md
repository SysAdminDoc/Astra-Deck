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

- [ ] P2 — Introduce a cross-browser extension API wrapper
  Why: Chrome 148 adds `browser.*` while Firefox already uses it, but Astra still calls `chrome.*` directly across popup, sidepanel, background, and core modules.
  Evidence: Chrome browser namespace docs, MDN Chrome incompatibilities, `extension/popup.js`, `extension/sidepanel.js`, `extension/background.js`.
  Touches: `extension/core/`, `extension/popup.js`, `extension/sidepanel.js`, `extension/background.js`, `tests/hardening.test.js`, `eslint.config.js`.
  Acceptance: New code imports a small wrapper for storage/runtime/tabs/permissions/downloads, existing direct calls are migrated in bounded batches, and tests cover Chrome-only and Firefox-style namespace availability.
  Complexity: L

