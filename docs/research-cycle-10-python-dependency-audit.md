# Project Research and Feature Plan - Cycle 10 Python Dependency Audit

Date: 2026-06-04

## Executive Summary

Astra Deck already has a JavaScript dependency vulnerability gate through
`npm audit --omit=dev --audit-level=moderate`, and Dependabot covers npm, pip,
and GitHub Actions manifests. The Python companion still lacks a standing
vulnerability audit in CI. A local `pip-audit` run against
`astra_downloader/requirements.txt` is currently clean, which makes this a small
preventive hardening item rather than an emergency fix.

Recommended next item:

1. P2 - Add a Python companion dependency audit gate for
   `astra_downloader/requirements.txt`.
2. P2 - Add PR dependency-review coverage so dependency-changing pull requests
   cannot introduce known-vulnerable direct or transitive packages unnoticed.
3. P3 - Emit or upload a JSON/markdown audit summary for release review.

## Evidence Reviewed

Local files inspected:

- `.github/dependabot.yml`
- `.github/workflows/validate.yml`
- `.github/workflows/yt-dlp-smoke.yml`
- `astra_downloader/requirements.txt`
- `package.json`
- `RESEARCH_REPORT.md`
- `docs/cws-submission-checklist.md`
- `docs/research-cycle-8-ci-release-integrity.md`

Local findings:

- Dependabot is configured for:
  - npm at repository root.
  - pip in `/astra_downloader`.
  - GitHub Actions monthly.
- `package.json` wires `audit:deps` into `npm run check`, and `audit:deps` runs
  `npm audit --omit=dev --audit-level=moderate`.
- `validate.yml` has a JS job that runs `npm test` and `npm run check`.
- `validate.yml` has a Python job that installs
  `astra_downloader/requirements.txt`, installs `pytest`, and runs
  `python -m pytest astra_downloader`.
- `validate.yml` does not run `pip-audit`, `safety`, OSV Scanner, or GitHub
  dependency-review action.
- `yt-dlp-smoke.yml` gates extractor functionality, not dependency
  vulnerability status.
- `requirements.txt` has exact pins for `yt-dlp==2026.3.17` and
  `curl_cffi==0.15.0`, plus upper-major bounds for PyQt6, Flask, requests, and
  waitress.

Local audit probe:

```powershell
py -3.12 -m pip_audit -r astra_downloader/requirements.txt --format json --progress-spinner off
```

Result on 2026-06-04:

- Exit code: 0.
- Tool version: `pip-audit 2.10.0`.
- No known vulnerabilities found.
- Resolved 25 packages, including `yt-dlp`, `curl-cffi`, `pyqt6`, `flask`,
  `requests`, `waitress`, `urllib3`, `werkzeug`, `jinja2`, and transitive
  dependencies.
- The command printed several local cache deserialization warnings from
  `cachecontrol`; they did not affect the audit result.

External sources reviewed:

- PyPA `pip-audit`:
  https://github.com/pypa/pip-audit
- PyPA `gh-action-pip-audit`:
  https://github.com/pypa/gh-action-pip-audit
- GitHub dependency review overview:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependency-review
- `actions/dependency-review-action`:
  https://github.com/actions/dependency-review-action

## Current Gap

The current dependency maintenance posture is asymmetric:

| Surface | Update discovery | Vulnerability gate | Functional smoke |
| --- | --- | --- | --- |
| Node / extension build | Dependabot npm | `npm audit --omit=dev --audit-level=moderate` via `npm run check` | `npm test`, `npm run build` |
| GitHub Actions | Dependabot monthly | No dedicated dependency-review action | Workflow execution |
| Python companion | Dependabot pip | No `pip-audit` / OSV gate | `pytest`, monthly yt-dlp smoke |

The Python companion is security-sensitive because it handles local downloads,
YouTube cookies for authenticated user-initiated downloads, filesystem paths,
Flask/Waitress HTTP handling, PyQt6 GUI startup, and subprocess-backed yt-dlp
execution. The project already pins and bounds dependencies thoughtfully, but a
standing audit is the missing feedback loop.

## Recommended Roadmap Item

Add one P2 item:

**Add a Python companion dependency audit gate.**

Acceptance shape:

- CI audits `astra_downloader/requirements.txt` on push and PR.
- The audit uses either:
  - `py -3.12 -m pip_audit -r astra_downloader/requirements.txt --format json`;
    or
  - `pypa/gh-action-pip-audit@v1.1.0` with `inputs:
    astra_downloader/requirements.txt`.
- The audit fails on moderate-or-higher fixable advisories unless a documented
  ignore is present.
- Any ignore lists advisory ID, reason, affected code path, applicability
  analysis, and expiry/recheck date.
- Dependency-changing PRs also run `actions/dependency-review-action` or an
  equivalent PR-time check.
- The workflow summary or artifact preserves enough audit output for release
  review.

## Implementation Notes

Option A - inline Python step:

```yaml
- name: Python dependency audit
  run: |
    python -m pip install pip-audit
    python -m pip_audit -r astra_downloader/requirements.txt --format json --progress-spinner off
```

Advantages:

- Same Python setup as the test job.
- Easy to run locally with the same command.
- No new action dependency beyond `actions/setup-python`.

Tradeoff:

- Maintainer owns formatting, output capture, and ignore handling.

Option B - official action:

```yaml
- uses: pypa/gh-action-pip-audit@v1.1.0
  with:
    inputs: astra_downloader/requirements.txt
    vulnerability-service: pypi
```

Advantages:

- Purpose-built summary and configuration.
- Supports `inputs`, `vulnerability-service`, `ignore-vulns`,
  `require-hashes`, and `no-deps`.

Tradeoff:

- Adds another GitHub Action dependency to track through Dependabot.

Option C - dependency review:

```yaml
- uses: actions/dependency-review-action@v5
  with:
    fail-on-severity: moderate
```

Advantages:

- Blocks newly introduced vulnerable dependency versions on PRs.
- Can also surface invalid licenses if the maintainer later chooses a license
  policy.

Tradeoff:

- PR-diff focused. It complements but does not replace a recurring or push-time
  `pip-audit` baseline check.

## Verification Ideas

- Local clean baseline:

```powershell
py -3.12 -m pip_audit -r astra_downloader/requirements.txt --format json --progress-spinner off
```

- CI clean baseline: push or dispatch `Validate` and confirm the Python audit
  step passes before `pytest` or in a separate dependency-audit job.
- Failure probe: in a throwaway branch, pin a package/version with a known
  advisory and confirm the audit step fails.
- Ignore probe: add a temporary ignore with a fake or known advisory ID and
  confirm the workflow requires rationale text instead of silently suppressing
  the finding.
- Keep existing validation gates intact: `python -m pytest astra_downloader`,
  `npm run check`, `npm test`, and the monthly yt-dlp smoke workflow.

## Explicit Non-Goals

- No dependency upgrades are required by this research pass; the current local
  `pip-audit` baseline is clean.
- No replacement for Dependabot. Dependabot still discovers candidate updates;
  the audit gate verifies vulnerability status.
- No replacement for the yt-dlp smoke workflow. The smoke test proves extractor
  behavior; `pip-audit` proves known vulnerability status.
- No emergency advisory ignore. Any future ignore must be deliberate and
  time-bounded.

## Open Questions

- Should the audit run inside the existing Python test job, or as a separate
  dependency-audit job that can fail faster before installing Qt-heavy runtime
  dependencies?
- Should the workflow use PyPI advisories only, OSV, or both?
- Should vulnerability output be uploaded as JSON for release evidence, or is
  a workflow summary sufficient?
- Should license policy be added to dependency review now, or left for a later
  legal/maintainer decision?
