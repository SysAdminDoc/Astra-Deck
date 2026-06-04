# Project Research and Feature Plan - Cycle 15 Secret Scanning Alert

Date: 2026-06-04

## Executive Summary

GitHub secret scanning reports one open alert in the public Astra Deck
repository. The alert is a `google_api_key` finding, created on 2026-01-26,
with `publicly_leaked: true`, `multi_repo: true`, and `validity: unknown`.
The locations point at generated/current userscript and extension sources plus
archived userscript snapshots. This needs explicit triage even if the value is
an intentional public YouTube/Innertube bootstrap key, because the repository's
Security tab currently treats it as an unresolved leaked secret.

Recommended next item:

1. P0 - Triage and resolve the open Google API Key secret-scanning alert.
2. P1 - Enable validity checks and non-provider pattern scanning where GitHub
   exposes those settings for the repository/account.
3. P2 - Add a short source/security note if the value is intentionally public
   and safe to ship.

## Evidence Reviewed

Local/current commands inspected:

- `gh api repos/SysAdminDoc/Astra-Deck --jq "{private,visibility,security_and_analysis:.security_and_analysis}"`
- `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts --paginate`
- `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts?state=open --paginate`
- `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts/1 --jq "{number,state,secret_type,secret_type_display_name,created_at,resolved_at,resolution,validity,publicly_leaked,multi_repo,html_url}"`
- `gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts/1/locations --paginate`
- `rg -n "secret scanning|push protection|non-provider|validity checks|secret_scanning_non_provider" ROADMAP.md RESEARCH_REPORT.md docs/repo-settings.md docs/research-cycle-12-dependency-review-enablement.md`

Important handling note:

- The secret value was not printed, pasted into docs, or committed during this
  research pass.
- Only alert metadata and file/line locations were recorded.

Live alert state:

```json
{
  "number": 1,
  "state": "open",
  "secret_type": "google_api_key",
  "secret_type_display_name": "Google API Key",
  "created_at": "2026-01-26T16:39:57Z",
  "resolved_at": null,
  "resolution": null,
  "validity": "unknown",
  "publicly_leaked": true,
  "multi_repo": true
}
```

Location summary:

- `YTKit.user.js`
- `YTKit- YouTube Customization Suite-25_11_user.js`
- `version_history/YTKit.user.js`
- `version_history/YTKit.user_v25.js`
- `version_history/YTKit_v25.user.js`
- `YTKit- YouTube Customization Suite-1.2.0.user.js`
- `archive/YTKit-v2.1.0.user.js`
- `archive/YTKit-v2.0.0.user.js`
- `archive/YTKit-v1.3.0.user.js`
- `archive/YTKit-v1.2.1.user.js`
- `archive/YTKit-v1.2.0.user.js`
- `archive/YTKit-v1.1.0.user.js`
- `archive/YTKit-v1.0.0.user.js`
- `archive/YTKit-v0.8.0.user.js`
- `archive/YTKit-v0.7.0.user.js`
- `archive/YTKit-v0.6.0.user.js`
- `YTKit.min.user.js`
- `extension/ytkit.js`
- `extension/core/transcript-service.js`

Repository security-analysis state:

```json
{
  "secret_scanning": {
    "status": "enabled"
  },
  "secret_scanning_push_protection": {
    "status": "enabled"
  },
  "secret_scanning_non_provider_patterns": {
    "status": "disabled"
  },
  "secret_scanning_validity_checks": {
    "status": "disabled"
  }
}
```

External sources reviewed:

- GitHub Docs - Evaluating alerts from secret scanning:
  https://docs.github.com/en/code-security/tutorials/remediate-leaked-secrets/evaluating-alerts
- GitHub Docs - Supported secret scanning patterns:
  https://docs.github.com/en/code-security/secret-scanning/introduction/supported-secret-scanning-patterns
- GitHub Docs - Secret scanning detection scope:
  https://docs.github.com/en/code-security/reference/secret-security/secret-scanning-detection-scope
- GitHub REST API - Secret scanning:
  https://docs.github.com/en/rest/secret-scanning/secret-scanning

Relevant source facts:

- GitHub generates secret-scanning alerts when supported token patterns are
  found in a repository.
- Validity checks help prioritize active secrets where supported.
- Non-provider patterns must be enabled separately for repositories/accounts
  where that setting is available.
- GitHub's REST API supports resolving alerts with explicit resolutions such as
  revoked, false-positive, used-in-tests, or wont-fix.

## Current Gap

The repository has good baseline secret protections:

- Secret scanning is enabled.
- Push protection is enabled.
- Current export/scrub code and docs recognize API keys, bearer tokens, and
  credential-shaped fields as sensitive.

But the security process is incomplete while alert 1 remains open:

- An open public Google API Key alert can hide whether there is a real leaked
  credential or an intentionally public bootstrap key.
- The alert's `validity` is unknown.
- Non-provider pattern scanning and validity checks are disabled in the current
  security-analysis response.

## Recommended Roadmap Item

Add one P0 manual-gated item:

**Triage and resolve open Google API Key secret-scanning alert.**

Acceptance shape:

- Do not print or paste the secret value during triage.
- Determine whether the detected value is:
  - a real Google API key with private/quota-bearing privileges;
  - an intentionally public YouTube/Innertube bootstrap key; or
  - stale historical material that has already been revoked.
- If real: revoke/rotate it in the provider console, remove it from current
  source/build outputs, regenerate affected userscript/extension artifacts, and
  resolve the alert as revoked.
- If intentional/public: document the rationale in source/security notes,
  confirm it is not a private quota-bearing credential, and resolve the alert
  with the appropriate non-secret resolution.
- Enable secret-scanning validity checks and non-provider pattern scanning where
  GitHub exposes those settings, or record why the account/repository cannot use
  them.

## Implementation Notes

Suggested implementation order:

1. Open the GitHub Security alert page for alert 1.
2. Identify the provider/project owner for the detected Google API key without
   copying the value into chat, logs, or docs.
3. If the key belongs to a private project, revoke it before changing code.
4. If the key is an intentional YouTube public bootstrap key, document why it is
   safe to ship and resolve the alert accordingly.
5. Update `docs/repo-settings.md` if secret-scanning settings are changed.
6. Re-run the alert API checks below.

## Verification Ideas

Alert state:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts/1 --jq "{state,resolution,resolved_at,validity,publicly_leaked,multi_repo}"
```

Expected after remediation:

- `state` is `resolved`.
- `resolution` records the chosen outcome.
- `resolved_at` is populated.

Open-alert count:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/secret-scanning/alerts?state=open --paginate --jq "length"
```

Expected:

- `0`, unless provider revocation or source replacement is still actively in
  progress and tracked.

Security settings:

```powershell
gh api repos/SysAdminDoc/Astra-Deck --jq ".security_and_analysis"
```

Expected:

- Secret scanning and push protection remain enabled.
- Validity checks and non-provider pattern scanning show enabled where GitHub
  exposes them for the account/repository, or `docs/repo-settings.md` records
  why they are unavailable.

## Explicit Non-Goals

- Do not paste the detected secret value into docs, issues, commits, logs, or
  chat.
- Do not rewrite public Git history as the first response; revoke/rotate first
  if the value is real.
- Do not close the alert without a recorded rationale.

## Open Questions

- Is the detected value an intentional public YouTube/Innertube bootstrap key or
  a private Google Cloud API key?
- If it is intentional/public, where should the source note live so future
  secret-scanning reviews do not rediscover the same ambiguity?
- Are validity checks and non-provider pattern scanning unavailable because of
  account plan limits, or simply disabled settings?
