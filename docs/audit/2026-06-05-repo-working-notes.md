# Repo Working Notes Reconciliation - 2026-06-05

## Scope

- `AGENTS.md`
- Planning ledgers that track Cycle 23

## Finding

`AGENTS.md` made ignored local `CLAUDE.md` the first-read working-note file for
future repo work. `CLAUDE.md` is intentionally ignored by Git, and it still
contained current-looking references to a missing repo-local Codex changelog
file, old Firefox support minimums, direct protected-branch release wording, and
historical release artifact counts.

## Fix

- Pointed the committed first-read instructions at tracked files that exist:
  `AUTONOMOUS-LOOP-STATE.md`, `CHANGELOG.md`, `COMPLETED.md`, `ROADMAP.md`,
  `RESEARCH_REPORT.md`, `docs/architecture.md`, `docs/signing-keys.md`, and
  `docs/audit/`.
- Labeled `CLAUDE.md` as optional ignored local scratch rather than the committed
  source of truth.
- Directed release-policy readers to `docs/signing-keys.md`, while tracked
  README/architecture/signing-key/CWS docs keep the current Firefox 140+,
  profile-split, and maintainer-local release contracts.

## Verification

- `Test-Path -LiteralPath CODEX-CHANGELOG.md`
- `git check-ignore -v -- CLAUDE.md`
- `rg -n 'CLAUDE.md.*source of truth|CODEX-CHANGELOG|strict_min_version: "128\.0"|Firefox 128|Firefox 128\+|push main|gh release create|All 5 artifacts|all 5 artifacts|Five-artifact|five-artifact' AGENTS.md`
- `rg -n 'AUTONOMOUS-LOOP-STATE|ROADMAP.md|RESEARCH_REPORT.md|docs/signing-keys.md|docs/audit|optional local context' AGENTS.md`
- `node scripts/check-versions.js`
