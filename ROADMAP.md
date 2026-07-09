# Roadmap - Astra Deck

## Research-Driven Additions

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

