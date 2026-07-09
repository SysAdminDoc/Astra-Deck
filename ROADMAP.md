# Roadmap - Astra Deck

## Research-Driven Additions

- [ ] P2 — Introduce a cross-browser extension API wrapper
  Why: Chrome 148 adds `browser.*` while Firefox already uses it, but Astra still calls `chrome.*` directly across popup, sidepanel, background, and core modules.
  Evidence: Chrome browser namespace docs, MDN Chrome incompatibilities, `extension/popup.js`, `extension/sidepanel.js`, `extension/background.js`.
  Touches: `extension/core/`, `extension/popup.js`, `extension/sidepanel.js`, `extension/background.js`, `tests/hardening.test.js`, `eslint.config.js`.
  Acceptance: New code imports a small wrapper for storage/runtime/tabs/permissions/downloads, existing direct calls are migrated in bounded batches, and tests cover Chrome-only and Firefox-style namespace availability.
  Complexity: L

