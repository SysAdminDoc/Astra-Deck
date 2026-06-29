# Roadmap - Astra Deck

## Research-Driven Additions

- [ ] P2 - Add YouTube experiment canaries for custom feeds, sponsored variants, and category chips
  Why: Competitor trackers show YouTube is changing sponsored-card, Playables, category-chip, and prompt-generated feed surfaces; Astra already hides related surfaces but needs drift canaries before selectors silently miss.
  Evidence: Control Panel for YouTube issues 300, 298, and 296; `extension/core/settings-schema.js:127`, `extension/ytkit.js:8590`, `extension/features/video-hider/index.js`.
  Touches: `extension/core/selector-packs/feed.js`, `extension/core/selector-packs/thumbnail.js`, `extension/features/video-hider/index.js`, `extension/features/home-subs-css/index.js`, `tests/selector-regression.test.js`, `tests/fixtures/*.tokens.txt`
  Acceptance: Selector packs include capture evidence for sponsored variants, Playables, custom prompt feeds, and category chips; diagnostics show misses by surface; hide/filter features continue to work when one selector variant changes.
  Complexity: M

- [ ] P2 - Add keyboard-path regression coverage for injected overlays
  Why: SponsorBlock's keyboard-only category bug shows mouse-path testing can miss extension UI failures; Astra has many injected dialogs, popovers, and menus with static a11y checks but limited keyboard-path behavior coverage.
  Evidence: SponsorBlock PR 2504; `docs/screen-reader-smoke.md`; `scripts/audit-overlays-a11y.js`.
  Touches: `scripts/audit-overlays-a11y.js`, `extension/features/settings-panel/index.js`, `extension/features/subscription-groups/index.js`, `extension/features/download-ui/index.js`, `tests/hardening.test.js`
  Acceptance: Local tests cover Tab/Shift-Tab focus movement, Enter/Space activation, Escape close behavior, select/typeahead paths, and aria-expanded/state updates for the main injected overlays without adding keyboard shortcuts.
  Complexity: M

- [ ] P2 - Add YouTube Takeout watch-history import for local analytics migration
  Why: FreeTube treats YouTube history import/export as a local-data ownership feature; Astra has watch analytics and study exports but no migration path from a user's existing Takeout history.
  Evidence: FreeTube PR 9204; `extension/ytkit.js` watch analytics/watch-time stores; `README.md` local-first data model.
  Touches: `extension/features/settings-panel/index.js`, `extension/ytkit.js`, `extension/core/storage-manager.js`, `extension/core/settings-schema.js`, `tests/settings-migration-roundtrip.test.js`, `tests/hardening.test.js`
  Acceptance: Users can import YouTube Takeout watch-history JSON locally; titles are normalized without adding trailing spaces; duplicates are merged by video ID/time; imported data feeds watch analytics without remote calls.
  Complexity: M

- [ ] P2 - Add import summaries and undo affordances for local data imports
  Why: Astra validates and rolls back import failures, but large settings/profile/subscription imports need a visible summary of changed data and a fast recovery path after commit.
  Evidence: YouTube Enhancer v1.33.0 settings import conflict handling; `extension/ytkit.js` settings/profile import paths; `extension/features/subscription-groups/index.js` OPML/JSON import paths.
  Touches: `extension/features/settings-panel/index.js`, `extension/ytkit.js`, `extension/features/subscription-groups/index.js`, `extension/core/settings-schema.js`, `tests/settings-migration-roundtrip.test.js`, `tests/hardening.test.js`
  Acceptance: Settings, profile, and subscription-group imports show counts for created/updated/skipped/duplicate data, expose an immediate undo action without adding confirmation dialogs, and keep existing validation/rollback protections.
  Complexity: M
