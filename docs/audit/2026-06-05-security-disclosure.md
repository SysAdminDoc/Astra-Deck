# Security Disclosure Audit - 2026-06-05

## Scope

- `SECURITY.md`
- `README.md`
- `CONTRIBUTING.md`
- `docs/signing-keys.md`
- `docs/repo-settings.md`
- GitHub private vulnerability reporting setting

## Finding

The repository had secret-scanning, signing-key, release-integrity, and
dependency-security hardening work, but no standing private disclosure policy.
Sensitive reports such as signing-key exposure, extension permission bypasses,
companion loopback authentication bypasses, dependency compromise, and release
artifact provenance mismatches were therefore routed only through public bug
reporting or informal maintainer contact.

## Fix

- Added root `SECURITY.md` with supported versions, private vulnerability
  reporting guidance, response windows, and high-priority classes.
- Linked the policy from README and CONTRIBUTING.
- Limited public bug-report guidance to non-sensitive bugs.
- Updated the signing-key leak runbook to use the standing policy and GitHub
  Security Advisory flow instead of a future ad-hoc `SECURITY.md` section.
- Recorded the live repository setting in `docs/repo-settings.md`.
- Enabled private vulnerability reporting through the GitHub repository API.

## GitHub State

- `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq .enabled`
  returned `true`.
- `gh api repos/SysAdminDoc/Astra-Deck/security-advisories --jq length`
  returned `0`; no advisory was created during this policy-only cycle.

## Verification

- `Test-Path SECURITY.md`
- `rg -n "Report a vulnerability|private vulnerability|security advisory|supported versions|public issues" SECURITY.md README.md CONTRIBUTING.md docs/signing-keys.md docs/repo-settings.md`
- `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq .enabled`
- `gh api repos/SysAdminDoc/Astra-Deck/security-advisories --jq length`
- `npm test`
- `npm run check`
- `npm run build`
