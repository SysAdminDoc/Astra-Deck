# Roadmap - Astra Deck

## Research-Driven Additions

### P2 — Documentation / Release Truth

- [ ] P2 — Architecture and release-doc truth gate
  Why: Active docs still reference v4.46.0, `RESEARCH_REPORT.md`, and retired GitHub Actions workflows while tests require local-only builds; stale trust docs undermine release integrity.
  Evidence: `docs/architecture.md:3`, `docs/architecture.md:127`, `docs/repo-settings.md:53`, `scripts/check-versions.js:6`, `tests/actions-policy.test.js:37`, `tests/hardening.test.js:1990`.
  Touches: `docs/architecture.md`, `docs/repo-settings.md`, `README.md`, `scripts/check-versions.js`, `tests/actions-policy.test.js`, `tests/hardening.test.js`.
  Acceptance: Active docs match the current version and local-only build policy; a local check fails if active docs mention retired workflow paths or stale current-version literals outside changelog/archive/history contexts.
  Complexity: S
