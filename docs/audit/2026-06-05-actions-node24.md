# GitHub Actions Node 24 Migration Audit - 2026-06-05

## Scope

- `.github/workflows/validate.yml`
- `.github/workflows/build.yml`
- `.github/workflows/yt-dlp-smoke.yml`
- `tests/hardening.test.js`

## Finding

Recent hosted `Validate` and `Build & Release` logs emitted GitHub's Node 20
JavaScript action deprecation warning for GitHub-owned action majors still pinned
to `checkout@v4`, `setup-node@v4`, `setup-python@v5`, and
`upload-artifact@v4`. GitHub says runners begin defaulting JavaScript actions to
Node 24 on 2026-06-16 and remove Node 20 later in 2026.

## Fix

All workflow uses now target the current Node 24-ready major lines observed on
2026-06-05:

- `actions/checkout@v6`
- `actions/setup-node@v6`
- `actions/setup-python@v6`
- `actions/upload-artifact@v7`

The dependency-review and attestation actions were left unchanged in this cycle
because it targeted the Node 20-era action majors identified in the roadmap
item.

Later on 2026-06-05, the follow-up SHA-pinning pass pinned these migrated refs,
the dependency-review action, release attestation actions, and CodeQL actions to
full 40-character commits. See
`docs/audit/2026-06-05-actions-sha-pinning.md` for the final source-side
workflow-ref contract and remaining hosted repository settings work.

## External References

- GitHub Changelog: Deprecation of Node 20 on GitHub Actions runners.
- `actions/checkout` latest release: `v6.0.3`.
- `actions/setup-node` latest release: `v6.4.0`.
- `actions/setup-python` latest release: `v6.2.0`.
- `actions/upload-artifact` latest release: `v7.0.1`.

## Verification

- `gh release view -R actions/checkout --json tagName,publishedAt,url`
- `gh release view -R actions/setup-node --json tagName,publishedAt,url`
- `gh release view -R actions/setup-python --json tagName,publishedAt,url`
- `gh release view -R actions/upload-artifact --json tagName,publishedAt,url`
- `rg -n "uses:\\s*actions/(checkout|setup-node|setup-python|upload-artifact)@" .github/workflows .github/dependabot.yml`
- Targeted hardening test and full local verification are recorded in
  `AUTONOMOUS-LOOP-STATE.md`.
