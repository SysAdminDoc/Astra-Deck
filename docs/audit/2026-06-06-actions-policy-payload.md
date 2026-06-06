# Actions Policy Payload Generator - 2026-06-06

## Scope

- `scripts/generate-actions-policy.js`
- `tests/actions-policy.test.js`
- `package.json`
- `.github/workflows/*.yml`
- `docs/hosted-policy-closure.md`
- `docs/repo-settings.md`

## Finding

The hosted policy runbook named the target selected-actions settings, but the
allowlist was still hand-copied from workflow review notes. That creates a
drift risk: adding a non-GitHub-owned action could break the next hosted
selected-actions enforcement pass, or a maintainer could copy an incomplete
`patterns_allowed` list.

GitHub's Actions permissions API uses a repository permissions payload with
`allowed_actions: selected` and `sha_pinning_required: true`, then a separate
selected-actions payload with `github_owned_allowed`, `verified_allowed`, and
`patterns_allowed`.

## Fix

- Added `npm run policy:actions`.
- The generator scans tracked workflow YAML files, parses every external
  `uses:` line, rejects non-SHA refs, and requires the same-line version
  comment used for Dependabot review context.
- The emitted payload is deterministic:
  - repository permissions: Actions enabled, selected actions, SHA pinning
    required;
  - selected actions: GitHub-owned actions allowed, verified creators disabled,
    and only the pinned `browser-actions/setup-firefox` ref in
    `patterns_allowed`;
  - inventory: workflow count plus GitHub-owned and non-GitHub-owned action
    refs.
- Updated the hosted policy runbook and repository settings ledger to use the
  generator before any hosted mutation.

## Verification

- `node --check scripts/generate-actions-policy.js`
- `node --test tests/actions-policy.test.js`
- `npm run policy:actions`
- `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`

## Remaining Work

- Do not apply the emitted hosted policy until the branch lands on `main` and
  the maintainer explicitly chooses to change repository settings.
- After applying it, rerun `Validate`, `Build & Release`, `yt-dlp Smoke`, and
  `CodeQL`, then record exact non-secret hosted outputs in
  `docs/repo-settings.md`.
