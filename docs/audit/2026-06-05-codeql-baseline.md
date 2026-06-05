# CodeQL Baseline Audit - 2026-06-05

## Scope

- `.github/workflows/codeql.yml`
- `.github/codeql.yml`
- `tests/hardening.test.js`
- `docs/repo-settings.md`
- GitHub code-scanning alerts API

## Finding

Astra Deck had dependency audit, secret scanning, release provenance, no-eval
checks, and private vulnerability reporting, but no semantic code-scanning
baseline for the privileged MV3 extension code or the local Python companion.
That left message passing, fetch proxying, TrustedHTML sinks, Flask routes,
subprocess/update paths, and loopback-token handling dependent on bespoke tests
and manual review.

## Fix

- Added advanced CodeQL setup in `.github/workflows/codeql.yml`.
- Scans `javascript-typescript` and `python` on pushes to `main` and
  `codex/**`, pull requests to `main`, weekly schedule, and manual dispatch.
- Uses `github/codeql-action/init@v4` and `github/codeql-action/analyze@v4`.
- Grants only `contents: read` and `security-events: write` to the analysis
  job.
- Uses `.github/codeql.yml` with `security-extended` and excludes
  `node_modules`, `build`, `mhtml`, `archive`, and `docs/archive`.
- Added a hardening regression that pins the language matrix, query suite,
  config path, and upload permission.

## GitHub State

- Push run `27002182993` completed successfully on
  `codex/research-feature-plan-2026-06-05`.
  - `CodeQL (javascript-typescript)`: success.
  - `CodeQL (python)`: success.
- Pull-request run `27002184466` completed successfully on the same head SHA.
  - `CodeQL (javascript-typescript)`: success.
  - `CodeQL (python)`: success.
- `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open --jq length`
  returned `0`.
- Default setup remains `not-configured` because advanced setup is now the
  configured path.

## Verification

- YAML parse for `.github/workflows/codeql.yml` and `.github/codeql.yml`.
- `node --test tests/hardening.test.js --test-name-pattern="CodeQL scans"`.
- `gh run view 27002182993 --json ...`.
- `gh run view 27002184466 --json ...`.
- `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open --jq length`.
- `npm test`.
- `npm run check`.
- `npm run build`.
