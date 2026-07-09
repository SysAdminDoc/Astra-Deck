# Roadmap - Astra Deck

No actionable items. Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

- [ ] P3 — Migrate popup.js and background.js onto the cross-browser API wrapper (next bounded batches)
  Why: `core/browser-api.js` shipped with sidepanel.js as the first migrated batch; popup.js (~112 direct `chrome.*` call sites) and background.js (~42) still call the vendor namespace directly.
  Where: `extension/popup.js`, `extension/background.js`, `tests/browser-api.test.js`.
  Acceptance: Each batch routes one surface's calls through the wrapper (background.js needs an inline resolver — the SW cannot load core scripts), with the existing Chrome-only/Firefox-style namespace tests extended to the migrated surface.
  Complexity: M
