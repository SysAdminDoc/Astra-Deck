# Project Research and Feature Plan - Cycle 19 Code Scanning Gate

Date: 2026-06-04

## Executive Summary

Astra Deck has strong dependency, release-integrity, secret-scanning, and
no-eval controls, but GitHub code scanning is not configured for the repository.
The repo contains a privileged MV3 background fetch/cookie proxy, large
YouTube DOM-manipulation content script, local Flask companion, yt-dlp
subprocess/update paths, and bearer-token loopback API. Those are exactly the
kind of JavaScript/Python source paths that benefit from a semantic SAST layer
in addition to bespoke tests.

Recommended next item:

1. P1 - Enable CodeQL code scanning for JavaScript extension code and the
   Python companion.

## Evidence Reviewed

Local/current commands inspected:

- `rg --files .github`
- `Get-Content .github/workflows/validate.yml`
- `Get-Content .github/workflows/build.yml`
- `Get-Content docs/repo-settings.md`
- `rg -n "codeql|code-scanning|security-events|static analysis|semgrep|scorecard|trivy|osv|pip-audit|npm audit|dependency-review|secret-scanning|slsa|provenance|SBOM|sbom" .github docs README.md ROADMAP.md RESEARCH_REPORT.md package.json scripts astra_downloader`
- `rg -n "chrome\.runtime\.onMessage|TrustedHTML\.setHTML|fetch\(|EXT_FETCH|@app\.route|subprocess\.run|subprocess\.Popen|validate_download_request_body|Bearer|token" extension astra_downloader`
- `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/default-setup --jq .`
- `gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts?state=open --jq length`

Observed repository state:

```json
{
  "code_scanning_default_setup_state": "not-configured",
  "detected_languages": [
    "actions",
    "javascript",
    "javascript-typescript",
    "python",
    "typescript"
  ],
  "code_scanning_alerts_api": "404 no analysis found",
  "workflow_security_events_permission": false,
  "codeql_workflow_present": false,
  "existing_dependency_security": [
    "npm audit",
    "pip-audit",
    "dependency-review-action",
    "Dependabot",
    "yt-dlp smoke workflow"
  ]
}
```

Current security-sensitive source surfaces:

- `.github/workflows/validate.yml:19` grants only `contents: read`; no job has
  `security-events: write`.
- `.github/workflows/validate.yml:38` runs JS tests/checks; `.github/workflows/validate.yml:72`
  runs Python dependency audit; `.github/workflows/validate.yml:100` runs Python
  downloader tests.
- `extension/manifest.json:25` requests API permissions including cookies and
  downloads.
- `extension/manifest.json:31` lists install-time host permissions, including
  YouTube, SponsorBlock, Return YouTube Dislike, AI providers, Cobalt, Ollama,
  and Astra Downloader loopback ports.
- `extension/manifest.json:263` defines extension-page CSP `connect-src` for
  those same external and loopback destinations.
- `extension/background.js:151` defines the `EXT_FETCH` origin allowlist and
  `extension/background.js:459` receives runtime messages.
- `extension/background.js:523` handles `EXT_FETCH`, and
  `extension/background.js:581` performs the proxied fetch.
- `extension/ytkit.js:5193` registers a content-script message listener.
- `extension/ytkit.js:28939` owns the AI Video Summary path, and
  `extension/ytkit.js:31157` reads the configurable Cobalt fallback endpoint.
- `astra_downloader/astra_downloader.py:87` imports Flask request helpers.
- `astra_downloader/astra_downloader.py:1496` validates `/download` request
  bodies.
- `astra_downloader/astra_downloader.py:2552` starts yt-dlp with
  `subprocess.Popen`.
- `astra_downloader/astra_downloader.py:2813` reads the per-install server
  token used by local API requests.

## External Sources Reviewed

Primary CodeQL and GitHub code-scanning sources:

1. https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options
2. https://docs.github.com/en/enterprise-cloud@latest/code-security/concepts/code-scanning/codeql/codeql-query-suites
3. https://github.com/github/codeql-action
4. https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/uploading-a-sarif-file-to-github
5. https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support-for-code-scanning
6. https://docs.github.com/en/rest/code-scanning/code-scanning
7. https://github.blog/2023-01-09-default-setup-a-new-way-to-enable-github-code-scanning/
8. https://codeql.github.com/docs
9. https://codeql.github.com/codeql-query-help/javascript/
10. https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-queries/python-built-in-queries
11. https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-javascript/
12. https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-python/

Browser extension and web-security sources:

13. https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html
14. https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
15. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions
16. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions
17. https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts
18. https://support.google.com/chrome_webstore/answer/186213
19. https://support.google.com/chrome_webstore/answer/2664769
20. https://support.mozilla.org/en-US/kb/extension-data-collection
21. https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/11-Client-side_Testing/01-Testing_for_DOM-based_Cross_Site_Scripting

Adjacent SAST / supply-chain tools:

22. https://github.com/ossf/scorecard-action
23. https://openssf.org/scorecard/
24. https://github.com/ossf/scorecard
25. https://google.github.io/osv-scanner/github-action/
26. https://docs.semgrep.dev/deployment/oss-deployment
27. https://semgrep.dev/docs/getting-started/cli
28. https://scorecard.dev/

Adjacent YouTube-extension / browser-extension landscape:

29. https://github.com/gorhill/uBlock
30. https://github.com/ajayyy/SponsorBlock
31. https://github.com/Anarios/return-youtube-dislike
32. https://github.com/ajayyy/SponsorBlockServer
33. https://github.com/duckduckgo/duckduckgo-privacy-extension
34. https://github.com/AdguardTeam/AdguardBrowserExtension

Academic / long-form background consulted for static-analysis and extension
risk context:

35. https://arxiv.org/abs/2406.12710
36. https://arxiv.org/abs/2503.04292
37. https://arxiv.org/abs/2605.07900
38. https://arxiv.org/abs/2208.03412

Relevant source facts:

- GitHub CodeQL advanced setup supports a language matrix and explicitly notes
  that `python` can be added if it is added after initial configuration.
- GitHub's built-in CodeQL `security-extended` query suite adds more security
  queries than `default`, with a higher false-positive tradeoff.
- The CodeQL Action initializes analysis, finalizes the database, runs queries,
  and uploads results to GitHub code scanning.
- GitHub code scanning can also ingest third-party SARIF, which makes CodeQL a
  base layer rather than the only possible scanner.
- OWASP calls out browser-extension risks around permissions overreach and
  insecure message passing between low-privilege and high-privilege extension
  contexts.
- Chrome documents that host permissions enable fetches, cookie access, and
  content-script injection and recommends optional or less powerful permissions
  to reduce alarming warnings.
- CodeQL JavaScript query help includes security areas relevant to Astra Deck:
  unsafe HTML construction, missing origin verification in message handlers,
  request forgery, command injection, URL redirect, and unsafe code/data flows.
- CodeQL Python query help includes Python security queries for areas such as
  code injection and uncontrolled command lines.

## Current Gap

Good current state:

- `npm run check` includes syntax, versions, i18n, settings, no-eval,
  Firefox-injection, lint, popup a11y, contrast, and dependency audit checks.
- `Validate` runs JS tests/checks, Python downloader tests, `pip-audit`, and PR
  dependency review.
- Release workflow emits SBOM, release manifest, checksums, and tag-time
  attestations.
- Secret-scanning, signing-key custody, private vulnerability reporting,
  Actions SHA-pinning, and dependency-graph settings are already in the queue.

Remaining gap:

- No CodeQL default setup or advanced setup.
- No CodeQL workflow file.
- No `security-events: write` job permission.
- No Security-tab code scanning baseline for JavaScript or Python.
- No documented triage policy for semantic code-scanning alerts.
- Current bespoke static checks catch narrow invariants such as no-eval, but
  not broader data-flow classes such as DOM XSS, missing message-origin checks,
  request forgery, path injection, or subprocess argument misuse.

## Recommended Roadmap Item

Add one P1 implementer-actionable item:

**Enable CodeQL code scanning for JavaScript extension code and the Python
companion.**

Acceptance shape:

- Add `.github/workflows/codeql.yml` or an equivalent advanced-setup workflow.
- Scan `javascript` and `python` on PRs, pushes to `main`, and a weekly
  schedule.
- Use least-privilege permissions: `contents: read`, `security-events: write`,
  and `actions: read` only if required.
- Use `github/codeql-action/init` and `github/codeql-action/analyze`.
- Select `security-extended`, or document why `security-and-quality` is
  preferred despite the extra false-positive and runtime load.
- Exclude non-source directories: `node_modules`, `build`, `mhtml`, `archive`,
  generated release artifacts, and docs-only fixture outputs.
- Keep the workflow independent of release artifact mutation.
- Record the first-run baseline and triage expectations in `docs/repo-settings.md`.
- After one clean run, add the exact CodeQL check name to branch protection or
  explicitly record why it remains advisory-only.

## Scoring

| Candidate | Fit | Impact | Effort | Risk | Novelty | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| CodeQL JS/Python code scanning | High | High | Medium | Medium | Medium | P1 |
| OpenSSF Scorecard as first new gate | Medium | Medium | Small | Medium | Low | P2 |
| Semgrep CE SARIF as first new gate | Medium | Medium | Medium | Medium | Medium | P2 |
| OSV Scanner SARIF | Low | Medium | Small | Low | Low | Rejected as duplicate for now |

Priority rationale:

- P1, not P0: no live exploit or red CI was found, but the repo is public and
  security-sensitive source paths are active.
- P1, not P2: the gap is a missing baseline SAST layer over privileged browser
  extension and local companion code, not only an optional supply-chain metric.

## Reject / Merge Ledger

- Rejected: add OSV Scanner as the next item. Reason: `npm audit`,
  `pip-audit`, Dependabot, dependency review, and yt-dlp smoke already cover
  dependency vulnerability posture well enough for the next pass.
- Deferred: OpenSSF Scorecard. Reason: it is useful after `SECURITY.md`,
  SHA-pinning, and CodeQL are in place, but several checks would currently
  rediscover already-open roadmap items.
- Deferred: Semgrep CE SARIF. Reason: useful as a second scanner, but CodeQL is
  the native GitHub baseline with first-class Security-tab integration and
  JavaScript/Python query packs.
- Merged: private vulnerability reporting and security policy remain covered by
  Cycle 18; this cycle does not duplicate that item.
- Merged: dependency graph / Dependabot alert enablement remains covered by
  Cycle 12; this cycle targets source-code data-flow analysis instead.

## Implementation Notes

Suggested implementation order:

1. Create a CodeQL workflow with a language matrix for `javascript` and
   `python`.
2. Add a small `.github/codeql.yml` only if path filters or query config are
   clearer than inline workflow config.
3. Use `security-extended` first; upgrade to `security-and-quality` only after
   measuring run time and false-positive volume.
4. Run it manually or via a temporary branch/PR and record the exact check names.
5. Triage initial alerts without suppressing by default.
6. Update `docs/repo-settings.md` with current state, query suite, alert triage
   policy, and required-check decision.
7. If the first successful run is clean or triaged, add the CodeQL check to
   `main` required checks.

## Verification Ideas

Workflow/config proof:

```powershell
rg -n "codeql-action/(init|analyze)|security-events: write|security-extended|javascript|python" .github
gh run list --workflow "CodeQL" --limit 5
```

GitHub Security-tab proof:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/code-scanning/default-setup --jq .state
gh api repos/SysAdminDoc/Astra-Deck/code-scanning/alerts --jq length
```

Expected:

- Code scanning analysis exists rather than returning `no analysis found`.
- JavaScript and Python analyses are visible in Security -> Code scanning.
- Any first-run findings are either fixed or documented with a tracked
  suppression rationale.

Branch-protection proof after the gate is stable:

```powershell
gh api repos/SysAdminDoc/Astra-Deck/branches/main/protection/required_status_checks --jq .
```

Expected:

- If CodeQL is required, the exact check context appears.
- If CodeQL is advisory-only, `docs/repo-settings.md` records the reason and
  the revisit condition.

## Explicit Non-Goals

- Do not replace the no-eval, lint, a11y, contrast, dependency, or yt-dlp smoke
  gates.
- Do not upload source code to a third-party SaaS scanner as the first SAST
  baseline.
- Do not require CodeQL before the first baseline run is observed and any
  existing findings are triaged.
- Do not scan generated artifacts, local MHTML captures, `node_modules`, or
  release outputs.

## Open Questions

- Should CodeQL become a required `main` status immediately after first success,
  or run advisory for one week to capture false positives?
- Should the query suite be `security-extended` only, or include
  `security-and-quality` once runtime is known?
- Should custom CodeQL data-extension models be added for Astra-specific
  message payloads, TrustedHTML wrappers, and local downloader token flows after
  the baseline is stable?
