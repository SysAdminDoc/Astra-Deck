# Roadmap - Astra Deck

## Research-Driven Additions

### P2 — Portability / Migration

- [ ] P2 — Userscript parity classification gate
  Why: The userscript drift check passes but reports 89 extension-only feature IDs with no machine-readable reason, making portability regressions hard to separate from intentional browser-API gaps.
  Evidence: `node scripts/check-userscript-drift.js` output, `scripts/check-userscript-drift.js`, `sync-userscript.js`, `extension/manifest.json`.
  Touches: `scripts/check-userscript-drift.js`, `sync-userscript.js`, `extension/manifest.json`, `tests/hardening.test.js`.
  Acceptance: Every extension-only feature ID is classified as `chrome-api`, `native-companion`, `unsafe-in-userscript`, `not-yet-ported`, or `intentional-extension-only`; the drift check fails on unclassified new IDs and prints parity counts by class.
  Complexity: S

- [ ] P2 — Subscription OPML import/export bridge
  Why: Subscription managers and desktop YouTube clients treat subscription import/export as table-stakes; Astra supports JSON/CSV groups but lacks OPML interop for migration.
  Evidence: PocketTube, FreeTube, `extension/features/subscription-groups/index.js:272`, `extension/features/subscription-groups/index.js:297`, `extension/features/subscription-groups/index.js:1199`.
  Touches: `extension/features/subscription-groups/index.js`, `tests/features/next-monolith-peel.test.js`, `extension/_locales/en/messages.json`, locale coverage script.
  Acceptance: Users can export groups/channels as OPML and import OPML with duplicate handling, malformed XML errors, row limits, and undo/status feedback; tests cover round-trip, duplicates, and invalid files.
  Complexity: M

### P2 — Documentation / Release Truth

- [ ] P2 — Architecture and release-doc truth gate
  Why: Active docs still reference v4.46.0, `RESEARCH_REPORT.md`, and retired GitHub Actions workflows while tests require local-only builds; stale trust docs undermine release integrity.
  Evidence: `docs/architecture.md:3`, `docs/architecture.md:127`, `docs/repo-settings.md:53`, `scripts/check-versions.js:6`, `tests/actions-policy.test.js:37`, `tests/hardening.test.js:1990`.
  Touches: `docs/architecture.md`, `docs/repo-settings.md`, `README.md`, `scripts/check-versions.js`, `tests/actions-policy.test.js`, `tests/hardening.test.js`.
  Acceptance: Active docs match the current version and local-only build policy; a local check fails if active docs mention retired workflow paths or stale current-version literals outside changelog/archive/history contexts.
  Complexity: S
