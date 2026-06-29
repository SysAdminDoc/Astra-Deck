# Roadmap - Astra Deck

## Research-Driven Additions

- [ ] P2 - Add import summaries and undo affordances for local data imports
  Why: Astra validates and rolls back import failures, but large settings/profile/subscription imports need a visible summary of changed data and a fast recovery path after commit.
  Evidence: YouTube Enhancer v1.33.0 settings import conflict handling; `extension/ytkit.js` settings/profile import paths; `extension/features/subscription-groups/index.js` OPML/JSON import paths.
  Touches: `extension/features/settings-panel/index.js`, `extension/ytkit.js`, `extension/features/subscription-groups/index.js`, `extension/core/settings-schema.js`, `tests/settings-migration-roundtrip.test.js`, `tests/hardening.test.js`
  Acceptance: Settings, profile, and subscription-group imports show counts for created/updated/skipped/duplicate data, expose an immediate undo action without adding confirmation dialogs, and keep existing validation/rollback protections.
  Complexity: M
