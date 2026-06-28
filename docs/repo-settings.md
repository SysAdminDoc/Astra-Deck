# Astra Deck Repository Settings

Last updated: 2026-06-28

This file records repository settings that are intentionally managed outside the
source tree.

The source tree currently uses local builds, local tests, and local release
artifact publication. Hosted workflow files are intentionally absent; do not add
or rely on hosted CI/CD without first reopening that policy decision in
`ROADMAP.md`.

## `main` Branch Protection

`main` accepts maintainer pushes after local verification. Required hosted
status checks should stay disabled while the repository has no hosted workflow
files.

Local verification before pushing:

- `npm test`
- `npm run check`
- `py -3.12 -m pytest astra_downloader/test_astra_downloader.py -q`
- `ASTRA_CRX_KEY_MODE=ephemeral node build-extension.js --bump patch --with-userscript`

Current policy:

- Keep admin enforcement enabled.
- Keep force pushes disabled.
- Keep branch deletion disabled.
- Keep required conversation resolution enabled.
- Keep repository rulesets empty unless replacing this classic branch-protection
  rule with an equivalent active ruleset.
- Keep local verification evidence in commits, release artifacts, and
  `CHANGELOG.md`, not hosted check contexts.

## GitHub Actions / Hosted CI Policy

Current source-tree status:

- No hosted workflow YAML is tracked.
- `npm run policy:actions` must report zero workflow files and zero external
  actions while the local-build policy is active.
- Release ZIP/CRX/XPI/userscript artifacts are built locally with
  `build-extension.js`.
- Dependency, lint, accessibility, overlay, contrast, version, settings, i18n,
  userscript-drift, Firefox-manifest, and Python gates run through local scripts.

Hosted Actions settings may remain enabled at the repository level, but the
source tree must not depend on them. If hosted workflows are reintroduced later,
add an active roadmap item first, define the exact trust boundary, and update
this file in the same commit.

## Private Vulnerability Reporting

Current snapshot from 2026-06-05:

- Private vulnerability reporting: enabled.
- Repository security advisory count: 0.
- Public issues: enabled.
- Root `SECURITY.md`: present and linked from README / CONTRIBUTING.

Policy:

- Keep root `SECURITY.md` current with supported versions, response windows,
  sensitive-report handling, and high-priority vulnerability classes.
- Keep private vulnerability reporting enabled for the public repository.
- Keep public bug-report templates for non-sensitive bugs only.
- Maintainers responsible for security triage should watch the repository for
  security alerts or all activity so private vulnerability reports are not
  missed.

## Code Scanning

Current source-tree policy:

- Hosted CodeQL workflow files are absent.
- Static security coverage runs locally through `npm run check`.
- `scripts/check-no-eval.js`, ESLint, dependency audit, policy-profile tests,
  background-proxy tests, and downloader pytest coverage are the active gates.

Policy:

- Keep generated outputs, `node_modules`, `build`, `mhtml`, and archived
  research/release artifacts out of local static scans unless a targeted audit
  explicitly includes them.
- Treat future static-analysis findings like security bugs: fix true positives,
  document dismissals with a reason, and avoid blanket suppressions.

## Secret Scanning

Current snapshot from 2026-06-05:

- Secret scanning: enabled.
- Secret scanning push protection: enabled.
- Open secret-scanning alerts: 0.
- Alert 1 (`google_api_key`): resolved as `false_positive` on 2026-06-05 after
  triage confirmed the matched value was a public YouTube/Innertube bootstrap
  fallback, not a private provider credential. The value was not printed in
  chat, docs, or commits.
- Active source and tracked archive snapshots no longer contain Google
  API-key-shaped literals; `extension/core/transcript-service.js` now requires
  a page-derived Innertube API key and falls through to the existing HTML /
  caption / DOM transcript methods when one is unavailable.
- Secret scanning validity checks: disabled.
- Secret scanning non-provider patterns: disabled.

Read-only refresh from 2026-06-06:

- Repository is public.
- Secret scanning: enabled.
- Secret scanning push protection: enabled.
- Dependabot security updates: disabled.
- Secret scanning validity checks: disabled.
- Secret scanning non-provider patterns: disabled.
- Dependency graph status is not exposed in the returned
  `security_and_analysis` block.

Attempted setting changes:

- 2026-06-05: form-encoded and JSON `PATCH /repos/SysAdminDoc/Astra-Deck`
  requests attempted to set `secret_scanning_validity_checks` and
  `secret_scanning_non_provider_patterns` to `enabled`. The endpoint returned
  successfully, but the repository `security_and_analysis` response still
  reported both settings as `disabled`. Treat these as unavailable/no-op through
  the repository endpoint until a GitHub UI or account-level code-security
  configuration exposes them.

Target policy:

- Keep secret scanning and push protection enabled.
- Do not commit provider-key-shaped literals. Parse public YouTube/Innertube
  client keys from page scripts at runtime instead.
- Re-check validity checks and non-provider patterns when repository security
  settings are revisited.

## Code Owners

Current snapshot from 2026-06-05:

- `.github/CODEOWNERS`: present on the feature branch; pending merge to `main`.
- Root `CODEOWNERS`: absent.
- `docs/CODEOWNERS`: absent.
- Repository owner: `@SysAdminDoc`.
- Current viewer permission from `gh repo view`: `ADMIN`.
- Required approving reviews on `main`: 1.
- Require code-owner reviews on `main`: disabled.
- CODEOWNERS errors endpoint on feature branch
  `the working feature branch`: `errors: []`.
- CODEOWNERS errors endpoint on default branch: `404 Not Found` until the file
  lands on `main`.

Read-only refresh from 2026-06-06:

- Required approving reviews on `main`: 1.
- Require code-owner reviews on `main`: disabled.
- Default-branch CODEOWNERS errors endpoint still returns `404 Not Found`.

Target policy:

- Keep `.github/CODEOWNERS` covering security-sensitive release, signing,
  security-policy, extension-permission, background-proxy, data-flow,
  trusted-DOM, and companion-loopback paths.
- Use only users or teams with write access.
- Re-check `gh api repos/SysAdminDoc/Astra-Deck/codeowners/errors --jq
  ".errors"` after the CODEOWNERS file lands on `main`.
- Enable `require_code_owner_reviews` after CODEOWNERS exists on `main`.
