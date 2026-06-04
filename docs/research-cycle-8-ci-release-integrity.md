# Project Research and Feature Plan - Cycle 8 CI and Release Integrity

Date: 2026-06-04

## Executive Summary

Astra Deck's local source tree has advanced to v4.46.0 with profile-split
Chrome/Firefox artifacts, companion update hardening, and a broad validation
suite, but the shared delivery channel has two immediate gaps. First, the
`Validate` workflow is red on `main` because the Python downloader job cannot
import PyQt6 on Ubuntu without Qt/EGL runtime libraries. Second, the public
"latest release" remains v4.5.2 while README and docs point users there for
installable artifacts. The highest-value direction is to restore CI first, then
publish a v4.46+ release with all profile-split artifacts plus checksums,
sidecars, and artifact provenance.

Top opportunities:

1. P0 - Restore green GitHub `Validate` by installing Qt Linux runtime
   libraries/offscreen display support or lazy-loading GUI imports for API-only
   tests.
2. P1 - Publish a v4.46+ release catch-up so README "latest release" links stop
   serving v4.5.2.
3. P1 - Add release-wide checksum manifest / sidecars, including
   `AstraDownloader.exe.sha256` when the companion binary is attached.
4. P1 - Add GitHub artifact/SBOM attestations for CI-built assets, or document a
   maintainer-local signing exception for CRX/XPI artifacts that must use
   `ytkit.pem`.
5. P2 - Reconcile `docs/signing-keys.md` with the actual release workflow so the
   project has one explicit source of truth for local-signed vs CI-built
   artifacts.

## Evidence Reviewed

Local files/directories inspected:

- `ROADMAP.md`, `RESEARCH_REPORT.md`, `COMPLETED.md`, `README.md`,
  `docs/signing-keys.md`, `docs/architecture.md`.
- `.github/workflows/validate.yml`, `.github/workflows/build.yml`,
  `.github/dependabot.yml`.
- `package.json`, `package-lock.json`, `pytest.ini`,
  `astra_downloader/requirements.txt`.
- `astra_downloader/astra_downloader.py`,
  `astra_downloader/test_astra_downloader.py`.
- `build/` profile-split v4.46.0 artifacts.

Git / release state inspected:

- `git pull --rebase` reported the repo already up to date; shared-folder Git
  maintenance emitted a geometric-repack temp-file error but did not change the
  working tree.
- `git log --oneline --max-count=40` showed active v4.46.0 work through
  `4227cfd test: pin companion update SHA-256 verification`.
- `gh run list --workflow Validate --limit 12` showed 12 consecutive failures on
  `main` from 2026-06-04 05:57 UTC through 10:43 UTC.
- Latest failed run inspected:
  `https://github.com/SysAdminDoc/Astra-Deck/actions/runs/26946855242`.
- `gh release view --json tagName,assets` showed latest public release v4.5.2
  from 2026-05-21 with five legacy assets.
- `build/` currently contains eight v4.46.0 profile-split extension artifacts:
  store-safe/GitHub-full Chrome ZIP+CRX and Firefox ZIP+XPI.

External sources reviewed:

- Qt for Linux requirements:
  https://doc.qt.io/qt-6/linux-requirements.html
- GitHub artifact attestations:
  https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- GitHub release asset API and digest fields:
  https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28
- GitHub Actions secure-use guidance:
  https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
- GitHub CLI `gh release verify-asset`:
  https://cli.github.com/manual/gh_release_verify-asset
- npm SBOM command:
  https://docs.npmjs.com/cli/commands/npm-sbom/
- Chrome Web Store program policies:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Mozilla add-on signing/distribution:
  https://devdoc.net/web/developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Distribution.html
- CISA SBOM overview:
  https://www.cisa.gov/sbom

Areas not verified:

- A live rerun of `Validate` after a fix was not possible because this cycle is
  research/planning only.
- No new release was cut during this cycle.
- Whether CRX/XPI artifacts should be CI-built or maintainer-local remains a
  project policy decision because `docs/signing-keys.md` currently says the
  `ytkit.pem` key should never enter CI.

## Current Product Map

Astra Deck is a desktop YouTube enhancement product with four release-relevant
surfaces:

- MV3 extension under `extension/`, built for Chrome-family and Firefox.
- Userscript built from the extension source by `sync-userscript.js`.
- Astra Downloader companion under `astra_downloader/`.
- Toolbar popup and in-page controls that direct users to the GitHub release
  channel for install/update flows.

Distribution is currently split between source/docs at v4.46.0 and the public
latest release at v4.5.2. Local build outputs already prove the intended
profile split, but there is no release-level checksum manifest committed or
attached in the workflow.

## Feature Inventory

Relevant release and CI features:

| Name | Entry point | Current maturity | Coverage / issue |
| --- | --- | --- | --- |
| JS validation | `.github/workflows/validate.yml` `js` job | Complete | Latest run JS job passed `npm test`, `npm run check`, and SBOM artifact upload. |
| Python downloader validation | `.github/workflows/validate.yml` `python` job | Broken in CI | Latest run fails during collection before tests because PyQt6 import needs `libEGL.so.1`. |
| Profile-split build artifacts | `npm run build`, `build-extension.js` | Locally complete | `build/` has eight v4.46.0 artifacts; latest public release does not. |
| Companion update hash verification | `astra_downloader/astra_downloader.py` | Partial | Code fetches `AstraDownloader.exe.sha256`; latest release has no companion asset/sidecar. |
| Signing-key policy | `docs/signing-keys.md` | Partial | Documents local `ytkit.pem` custody, but workflow still builds/uploads release artifacts in CI. |
| SBOM emission | `.github/workflows/validate.yml` | Partial | Current workflow uses `npm ls --omit=dev --json`; `npm sbom` is available locally and emits CycloneDX. |

## Competitive and Ecosystem Research

- GitHub now supports artifact attestations for binaries and SBOMs using
  workflow `id-token` and `attestations` permissions. Astra's build workflow has
  neither permission today.
- GitHub release assets expose SHA-256 digests through the release asset API, and
  the GitHub CLI can verify release assets against signed attestations.
- npm v11 supports `npm sbom`, generating SPDX or CycloneDX SBOMs from the
  current package graph. Astra's current SBOM artifact is `npm ls` JSON, useful
  but not a standard SBOM format.
- Qt documents xcb platform-plugin dependencies plus OpenGL dependencies for
  Linux GUI/Widgets. The current Python CI job installs only Python packages,
  explaining the `libEGL.so.1` collection failure.
- Mozilla signing docs require add-ons to be signed for default Firefox
  release/beta installs; a future Firefox release gate should keep the AMO or
  `web-ext sign` path in view.
- Chrome Web Store policy emphasizes narrow permissions, clear data handling,
  and reviewable packaged code; release manifests/checksums support the same
  trust posture for self-distributed GitHub artifacts.

## Highest-Value New Features

### Restore green GitHub Validate for Python downloader tests

- User problem solved: users and the build machine cannot trust release
  readiness while `main` CI is red.
- Evidence: latest run `26946855242` fails at Python test collection with
  `ImportError: libEGL.so.1`; `.github/workflows/validate.yml` lacks Qt runtime
  apt dependencies or offscreen/Xvfb setup; Qt Linux docs list required platform
  dependencies.
- Proposed behavior: make the Linux Python job install minimal Qt runtime
  libraries and run with an offscreen display, or refactor the downloader module
  so API/server tests can import without loading PyQt6 GUI modules.
- Implementation areas: `.github/workflows/validate.yml`, `pytest.ini`,
  `astra_downloader/astra_downloader.py`, downloader tests.
- Risks and edge cases: installing too broad an apt set slows CI; pure
  lazy-import work can accidentally split GUI/server side effects. Keep the
  acceptance test focused on collection and full test execution.
- Verification plan: green `Validate` run with Python job passing; local
  `python -m pytest astra_downloader`.
- Complexity: S.
- Priority: P0 because it blocks every later release-confidence item.

### Publish release catch-up with checksums and provenance

- User problem solved: README points users to "latest release", but latest
  release is v4.5.2 while the source/docs/build outputs are v4.46.0.
- Evidence: `package.json` and manifest are v4.46.0; local `build/` has eight
  v4.46.0 artifacts; GitHub latest release is v4.5.2; companion update code
  fetches a `.sha256` sidecar that is not present in that release.
- Proposed behavior: after CI is green, cut a v4.46+ release with all expected
  artifacts and a checksum manifest/sidecars. Add artifact/SBOM attestations
  for CI-built artifacts or document the local-signing exception for CRX/XPI.
- Implementation areas: release workflow, `build-extension.js` or release
  manifest script, release checklist docs, `docs/signing-keys.md`.
- Risks and edge cases: `ytkit.pem` must not be moved into CI casually; Firefox
  XPI signing policy may require separate AMO/unlisted signing work.
- Verification plan: `gh release view <tag> --json assets`, checksum manifest
  comparison, `gh release verify-asset` where attested, companion hash check.
- Complexity: M.
- Priority: P1 because it is blocked by P0 but directly affects users.

## Existing Feature Improvements

- `Validate` Python job: add missing Linux Qt runtime support or avoid GUI
  import at test collection.
- Release workflow: add explicit artifact manifest and provenance steps.
- Signing-key policy: reconcile "CI never builds CRX/XPI on `ytkit.pem`" with
  the live workflow's release artifact build/upload path.
- SBOM artifact: replace or supplement `npm ls --omit=dev --json` with
  `npm sbom --sbom-format=cyclonedx` or SPDX, then attach/attest it.

## Reliability, Security, Privacy, and Data Safety

- CI red state is a reliability risk: regressions can land with the Python job
  failing for environment reasons.
- Release lag is a trust risk: docs advertise current capabilities while
  install links provide older artifacts.
- Lack of release-side checksums/provenance is a supply-chain trust risk for
  self-distributed CRX/XPI/ZIP/userscript/companion downloads.
- `AstraDownloader.exe.sha256` is already part of the companion update contract;
  releases need to publish that sidecar whenever the companion binary is
  attached.

## UX, Accessibility, and Trust

Trust work here is user-facing even though it is release infrastructure:

- README "latest release" links need to land on artifacts that match the docs.
- Release notes should name store-safe vs GitHub-full packages plainly.
- Checksums and asset verification instructions should be visible in the release
  body or linked release checklist.

## Architecture and Maintainability

- The downloader module imports PyQt6 at module import time, coupling API tests
  to Linux GUI system libraries. A lazy-import split between server/testable
  helpers and GUI widgets would reduce CI environment sensitivity.
- Build/release policy currently spans `build-extension.js`,
  `.github/workflows/build.yml`, and `docs/signing-keys.md`.
  A single release checklist should state exactly which artifacts are CI-built,
  which are maintainer-local, which are signed, and which are attested.

## Prioritized Roadmap

- [ ] P0 - Restore green GitHub Validate for Python downloader tests
  - Why: `main` has repeated failing CI runs due to PyQt6 Linux runtime
    dependencies, not product test failures.
  - Evidence: `gh run view 26946855242 --log-failed`; Qt Linux requirements
    docs.
  - Touches: `.github/workflows/validate.yml`, `pytest.ini`,
    `astra_downloader/astra_downloader.py`.
  - Acceptance: Python job collects/runs the full downloader suite on
    `ubuntu-latest`; missing Qt runtime failures become explicit.
  - Verify: `gh run view <run-id> --json jobs`; `python -m pytest
    astra_downloader`.

- [ ] P1 - Publish v4.46+ release catch-up with checksums and provenance
  - Why: latest release is v4.5.2 while current source/build outputs are v4.46.0.
  - Evidence: `gh release view --json tagName,assets`; local `build/` v4.46.0
    artifacts; GitHub attestations and release-asset digest docs.
  - Touches: `.github/workflows/build.yml`, release docs/checklist,
    `docs/signing-keys.md`, release manifest script.
  - Acceptance: latest release matches current version and includes all expected
    artifacts plus SHA-256 manifest/sidecars and attestations or documented
    local-signing exception.
  - Verify: `node scripts/check-versions.js --tag <version>`, `npm run
    build:userscript`, `gh release view <tag> --json assets`, `gh release
    verify-asset` where applicable.

## Quick Wins

- Add an `apt-get install` step for the minimal Qt runtime dependency set and
  `QT_QPA_PLATFORM=offscreen` to the Python CI job.
- Use `npm sbom --omit=dev --sbom-format=cyclonedx` for the SBOM artifact.
- Generate `SHA256SUMS` from `build/*` and attach it to release drafts.

## Larger Bets

- Split `astra_downloader.py` into API/core/download helpers and GUI wiring so
  most tests import without PyQt6.
- Adopt signed GitHub release attestations for all CI-built assets.
- Add a release checklist that reconciles CRX/XPI local signing, AMO signing,
  companion checksums, and profile-split artifact names.

## Explicit Non-Goals

- Moving `ytkit.pem` into GitHub Actions without an explicit policy decision.
- Replacing AMO signing requirements with local XPI renaming.
- Adding new product features during this research pass.

## Open Questions

- Should CRX/XPI release artifacts remain maintainer-local because of
  `ytkit.pem`, or should CI build only ZIP/userscript/SBOM artifacts while local
  signed CRX/XPI are uploaded separately?
- Is the next public release intended to be v4.46.0 exactly or a new v4.47.0
  after the CI and release-manifest fixes land?
- Will `AstraDownloader.exe` be attached to the same release as the extension
  artifacts, and should its `.sha256` sidecar be single-line or included in a
  shared `SHA256SUMS` manifest?

## Appendix - Sources

Local:

- `ROADMAP.md`
- `RESEARCH_REPORT.md`
- `README.md`
- `docs/signing-keys.md`
- `.github/workflows/validate.yml`
- `.github/workflows/build.yml`
- `astra_downloader/astra_downloader.py`
- `astra_downloader/test_astra_downloader.py`
- `pytest.ini`
- `build/`
- GitHub run `26946855242`
- GitHub latest release `v4.5.2`

External:

- https://doc.qt.io/qt-6/linux-requirements.html
- https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28
- https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
- https://cli.github.com/manual/gh_release_verify-asset
- https://docs.npmjs.com/cli/commands/npm-sbom/
- https://developer.chrome.com/docs/webstore/program-policies/policies
- https://devdoc.net/web/developer.mozilla.org/en-US/docs/Mozilla/Add-ons/Distribution.html
- https://www.cisa.gov/sbom
