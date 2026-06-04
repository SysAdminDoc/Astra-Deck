# Project Research and Feature Plan - Cycle 18 Security Disclosure Channel

Date: 2026-06-04

## Executive Summary

Astra Deck has active security-sensitive release, signing-key, secret-scanning,
and dependency hardening work, but the public repository does not currently
publish a `SECURITY.md` policy and private vulnerability reporting is disabled.
That means an outside researcher who finds a signing-key exposure, extension
privilege issue, companion loopback flaw, or release artifact mismatch has no
clear private path. The next planning item should create a security policy and
enable GitHub's private vulnerability reporting for the public repo.

Recommended next item:

1. P1 - Publish security disclosure policy and enable private vulnerability
   reporting.

## Evidence Reviewed

Local/current commands inspected:

- `Get-ChildItem -Path . -Force -File | Select-Object -ExpandProperty Name`
- `Get-ChildItem -Path .github -Recurse -File | Select-Object -ExpandProperty FullName`
- `rg -n "SECURITY\.md|security policy|vulnerability|advisory|private vulnerability|report a vulnerability|security advisory|CVE|coordinated disclosure|contact" README.md docs ROADMAP.md RESEARCH_REPORT.md .github`
- `gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq .`
- `gh api repos/SysAdminDoc/Astra-Deck/security-advisories --jq length`
- `Get-Content CONTRIBUTING.md`

Observed repository state:

```json
{
  "root_security_md_present": false,
  "github_security_policy_file_present": false,
  "private_vulnerability_reporting_enabled": false,
  "repository_security_advisory_count": 0,
  "issues_enabled": true
}
```

Current disclosure surface:

- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `CONTRIBUTING.md` tells bug reporters to use the public bug-report template.
- `docs/signing-keys.md` says a confirmed signing-key leak should publish a
  security advisory and include a `SECURITY.md` section, but that policy file
  does not currently exist.

External sources reviewed:

- GitHub Docs - Adding a security policy to your repository:
  https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/adding-a-security-policy-to-your-repository
- GitHub Docs - Configuring private vulnerability reporting for a repository:
  https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository
- GitHub Docs - Privately reporting a security vulnerability:
  https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/privately-reporting-a-security-vulnerability
- GitHub Docs - About repository security advisories:
  https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/about-repository-security-advisories

Relevant source facts:

- GitHub says a security policy gives people instructions for reporting
  vulnerabilities and should include supported versions plus how to report.
- GitHub private vulnerability reporting lets researchers submit reports
  directly and privately to maintainers on public repositories.
- GitHub notes that without private vulnerability reporting, reporters must use
  the repository security policy or create a public issue asking for a security
  contact.
- Repository security advisories are available for public repositories and
  support private discussion/fix coordination before publication.

## Current Gap

Good current state:

- Public issues and bug templates exist.
- Security-sensitive runbooks and roadmap items now identify secret scanning,
  signing-key custody, dependency review, release integrity, and companion
  trust boundaries.
- The repository can use GitHub security advisories because it is public.

Remaining gap:

- There is no checked-in `SECURITY.md`.
- Private vulnerability reporting is disabled.
- Public contribution docs route bug reports through public issues.
- The signing-key leak runbook references a future `SECURITY.md` section
  instead of an existing security policy and private reporting channel.

## Recommended Roadmap Item

Add one P1 manual-gated item:

**Publish security disclosure policy and enable private vulnerability
reporting.**

Acceptance shape:

- Add a root `SECURITY.md`.
- Include supported versions and release channels.
- Explain the preferred private reporting path and expected response windows.
- Tell reporters not to paste secrets, keys, exploit payloads, private logs, or
  user data into public issues.
- List high-priority vulnerability classes:
  - signing-key exposure;
  - extension permission or host-permission bypass;
  - companion loopback auth or DNS-rebinding bypass;
  - dependency compromise;
  - release artifact, checksum, SBOM, or provenance mismatch;
  - secret-scanning alert or credential exposure.
- Enable private vulnerability reporting in repository settings.
- Configure maintainer notification expectations.
- Link `SECURITY.md` from README/CONTRIBUTING and update the signing-key leak
  procedure to use repository security advisories.

## Implementation Notes

Suggested implementation order:

1. Draft root `SECURITY.md` from the current release/support model.
2. Link it from README and CONTRIBUTING.
3. Update `docs/signing-keys.md` leak response to point to repository security
   advisories and the existing policy.
4. Enable private vulnerability reporting in GitHub settings.
5. Record the final setting in `docs/repo-settings.md`.
6. Confirm the Security page exposes the private report flow.

## Verification Ideas

Policy file and links:

```powershell
Test-Path SECURITY.md
rg -n "Report a vulnerability|private vulnerability|security advisory|supported versions" SECURITY.md README.md CONTRIBUTING.md docs/signing-keys.md
```

Expected:

- `SECURITY.md` exists at the repo root.
- README, CONTRIBUTING, and signing-key leak response point to the policy or
  repository security advisories.

Private reporting setting:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/private-vulnerability-reporting --jq .enabled
```

Expected:

- `true`.

Manual UI check:

- Open the repository Security page.
- Confirm the private report path is visible.
- Confirm the page also links the security policy.

## Explicit Non-Goals

- Do not ask reporters to disclose exploit details or secrets in public issues.
- Do not create a fake advisory just to test the flow.
- Do not replace dependency-alert, secret-scanning, or release-integrity work;
  this item only provides the disclosure channel and policy.

## Open Questions

- What response-window language should the maintainer commit to for first
  acknowledgement and initial triage?
- Should the policy list only the latest release as supported, or also support
  the previous self-distributed CRX release during forced key rotations?
