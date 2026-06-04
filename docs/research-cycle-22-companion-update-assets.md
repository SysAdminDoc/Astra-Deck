# Research Cycle 22 - Companion Update Release Assets

Date: 2026-06-04

## Executive Summary

The Astra Downloader `/update` endpoint is implemented, but the live release
channel is not yet proven for companion self-update. The latest public GitHub
Release observed during this pass is `v4.46.0`, published 2026-06-04
12:22:15Z, with eight profile-split extension artifacts, the userscript, npm
SBOM, `release-manifest.json`, and `SHA256SUMS`. It does not attach
`AstraDownloader.exe` or `AstraDownloader.exe.sha256`. The source still reports
`APP_VERSION = "1.5.1"`, and the roadmap correctly says that version must not
advance until a matching companion binary release is built and published.

This is not the same as the signed installer/MSI roadmap item. The installer
row is about onboarding trust, signing budget, and Windows package polish. This
cycle's finding is a narrower release-channel contract: before the companion can
advertise or perform a self-update, the intended release must contain the exact
EXE asset, a verifiable hash sidecar, release-manifest/checksum coverage, and a
dry-run proof that the updater URLs resolve to those assets.

## Scope And Anti-Duplication

- Existing shipped item: `ROADMAP.md` marks the `/update` endpoint and popup
  action delivered, with `APP_VERSION` intentionally frozen until the matching
  companion binary release exists.
- Existing open item: `P2 - Astra Downloader signed installer + MSI` remains
  valid and manual/budget gated.
- Cycle 8 already recorded release-integrity and companion hash questions. This
  pass rechecked the live release, current build scripts, release-manifest
  generator, and tests after later release tooling work landed.
- New queue item should be `P1` because a future `APP_VERSION` bump can create a
  bad updater state if source version, latest-release assets, hash sidecar, and
  release manifest are not synchronized.

## Local Evidence

### Live Release Probe

Command used:

```powershell
gh release view --repo SysAdminDoc/Astra-Deck --json tagName,targetCommitish,assets,url,isDraft,isPrerelease,publishedAt
```

Observed latest release:

- Tag: `v4.46.0`
- Target commit: `ac6a3633165547bbb0358191e43fe2038dbfbf73`
- Published: `2026-06-04T12:22:15Z`
- Assets present:
  - `astra-deck-github-full-chrome-v4.46.0.crx`
  - `astra-deck-github-full-chrome-v4.46.0.zip`
  - `astra-deck-github-full-firefox-v4.46.0.xpi`
  - `astra-deck-github-full-firefox-v4.46.0.zip`
  - `astra-deck-npm-sbom.cdx.json`
  - `astra-deck-store-safe-chrome-v4.46.0.crx`
  - `astra-deck-store-safe-chrome-v4.46.0.zip`
  - `astra-deck-store-safe-firefox-v4.46.0.xpi`
  - `astra-deck-store-safe-firefox-v4.46.0.zip`
  - `release-manifest.json`
  - `SHA256SUMS`
  - `ytkit-v4.46.0.user.js`
- Assets missing:
  - `AstraDownloader.exe`
  - `AstraDownloader.exe.sha256`

### Updater Contract

- `astra_downloader/astra_downloader.py:94` keeps `APP_VERSION = "1.5.1"`.
- `astra_downloader/astra_downloader.py:128-130` reads the latest companion
  version from raw `main`, then downloads
  `https://github.com/SysAdminDoc/Astra-Deck/releases/latest/download/AstraDownloader.exe`
  and
  `https://github.com/SysAdminDoc/Astra-Deck/releases/latest/download/AstraDownloader.exe.sha256`.
- `astra_downloader/astra_downloader.py:432-441` treats the expected SHA-256 as
  best effort and returns `None` for missing, malformed, or failed sidecar
  fetches.
- `astra_downloader/astra_downloader.py:1296-1339` compares local/source
  versions, downloads the EXE, validates file size and `MZ`, fetches the
  optional sidecar, verifies SHA-256 only when present, and proceeds with a log
  message when the sidecar is unavailable.
- `astra_downloader/astra_downloader.py:3177-3185` exposes the `/update` route
  through the companion server.

### Build And Manifest Contract

- `astra_downloader/build.py:3-4` documents that the PyInstaller build outputs
  `AstraDownloader.exe` to the repository root.
- `astra_downloader/build.py:31` sets `OUT_EXE = ROOT / "AstraDownloader.exe"`.
- `astra_downloader/build.py:96-99` copies the built EXE into that root path.
- `scripts/generate-release-manifest.js:10` reads release assets from `build/`.
- `scripts/generate-release-manifest.js:72-89` knows how to parse
  `AstraDownloader.exe` and `AstraDownloader.exe.sha256` when those names are
  present.
- `scripts/generate-release-manifest.js:101-112` does not require the companion
  EXE or sidecar in the default expected release-name set.
- `scripts/generate-release-manifest.js:134-139` writes
  `build/AstraDownloader.exe.sha256` only when `build/AstraDownloader.exe`
  exists.

### Release Workflow And Checklist

- `.github/workflows/build.yml:16` runs the tag build on `ubuntu-latest`.
- `.github/workflows/build.yml:38-47` builds userscript/profile artifacts, emits
  the release manifest, and uploads `build/*`; it does not build or stage the
  Windows companion EXE.
- `docs/signing-keys.md:198-216` documents the local public-release checklist:
  clean tree, tests, `npm run build:userscript`, SBOM, `npm run
  release:manifest`, upload `build/*`, and digest comparison. It does not tell
  maintainers when or how to stage `AstraDownloader.exe` into `build/`.
- `docs/research-cycle-8-ci-release-integrity.md:118` already marked companion
  update hash verification partial because the latest release had no companion
  asset/sidecar.
- `docs/research-cycle-8-ci-release-integrity.md:202-203` noted that
  `AstraDownloader.exe.sha256` is already part of the update contract.
- `docs/research-cycle-8-ci-release-integrity.md:280-281` carried forward the
  open release-shape question: whether `AstraDownloader.exe` attaches to the
  same release as the extension release and how the sidecar is generated.

### Test Gap

- `astra_downloader/test_astra_downloader.py:2175-2290` covers `/update` with
  mocked network helpers.
- The success path currently mocks `fetch_expected_sha256` as `None`, proving
  success without a hash sidecar. That is useful for the current code path, but
  it does not prove the intended live release-channel contract.

## External Sources Reviewed

1. GitHub Docs - About releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
2. GitHub Docs - Linking to releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
3. GitHub REST API - Release assets:
   https://docs.github.com/en/rest/releases/assets
4. GitHub REST API - Releases:
   https://docs.github.com/en/rest/releases/releases
5. GitHub CLI - `gh release upload`:
   https://cli.github.com/manual/gh_release_upload
6. GitHub CLI - `gh release download`:
   https://cli.github.com/manual/gh_release_download
7. GitHub CLI - `gh release verify-asset`:
   https://cli.github.com/manual/gh_release_verify-asset
8. GitHub Docs - Artifact attestations:
   https://docs.github.com/en/actions/concepts/security/artifact-attestations
9. GitHub Docs - Use artifact attestations:
   https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
10. GitHub Docs - Verify attestations offline:
    https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verifying-attestations-offline
11. GitHub CLI - `gh attestation verify`:
    https://cli.github.com/manual/gh_attestation_verify
12. GitHub Actions - Store and share workflow artifacts:
    https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow
13. `actions/upload-artifact` README:
    https://github.com/actions/upload-artifact
14. PyInstaller usage:
    https://pyinstaller.org/en/stable/usage.html
15. PyInstaller operating mode:
    https://pyinstaller.org/en/stable/operating-mode.html
16. PyInstaller spec files:
    https://pyinstaller.org/en/stable/spec-files.html
17. Microsoft SignTool:
    https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
18. Microsoft MSIX signing overview:
    https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview
19. Microsoft SignTool app-package signing:
    https://learn.microsoft.com/en-us/windows/msix/package/sign-app-package-using-signtool
20. The Update Framework:
    https://theupdateframework.io/
21. TUF specification:
    https://theupdateframework.github.io/specification/latest/
22. TUF documentation:
    https://theupdateframework.readthedocs.io/en/latest/
23. SLSA provenance v1.0:
    https://slsa.dev/spec/v1.0/provenance
24. SLSA requirements v1.1:
    https://slsa.dev/spec/v1.1/requirements
25. Sigstore cosign repository:
    https://github.com/sigstore/cosign
26. Sigstore cosign overview:
    https://docs.sigstore.dev/cosign/overview/
27. OWASP firmware update mechanism:
    https://owasp.org/owasp-istg/03_test_cases/firmware/firmware_update_mechanism.html
28. Electron `autoUpdater`:
    https://www.electronjs.org/docs/latest/api/auto-updater
29. Tauri updater plugin:
    https://v2.tauri.app/plugin/updater/
30. Sparkle documentation:
    https://sparkle-project.org/documentation/
31. WinSparkle:
    https://winsparkle.org/
32. Squirrel.Windows:
    https://github.com/Squirrel/Squirrel.Windows
33. Microsoft Defender SmartScreen:
    https://learn.microsoft.com/en-us/windows/security/application-security/application-control/smart-app-control/microsoft-defender-smartscreen
34. CISA SBOM overview:
    https://www.cisa.gov/sbom
35. GitHub Docs - Managing releases:
    https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
36. GitHub Docs - Release asset storage and bandwidth quotas:
    https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas

## Landscape Findings

- GitHub Releases are the correct place to publish downloadable software
  iterations and release assets, but asset availability is name-sensitive. The
  updater's `/releases/latest/download/AstraDownloader.exe` URL will fail until
  the latest intended companion update release attaches that exact asset name.
- GitHub Release assets expose API metadata and can be uploaded/downloaded with
  `gh release upload` and `gh release download`; this supports a cheap live
  dry-run before any `APP_VERSION` bump.
- GitHub artifact attestations, SLSA provenance, and Sigstore all push toward
  explicit build provenance for release artifacts. Astra already attests `build/*`
  in tag workflows, but the companion EXE is not in `build/*` today.
- TUF, Tauri, Electron, Sparkle, WinSparkle, and Squirrel all treat update
  metadata, version/asset consistency, and integrity checks as core update-system
  requirements. Astra's lightweight updater can stay simpler, but it should not
  rely on a source-version probe alone.
- Microsoft SignTool/MSIX/SmartScreen sources reinforce the signed-installer
  backlog item, but unsigned EXE self-update proof can still be useful if the
  roadmap documents the trust caveat and keeps signed MSI as a separate follow-up.
- CISA SBOM guidance and the current npm SBOM artifact support retaining release
  integrity metadata, but the companion EXE has no per-artifact SBOM/provenance
  story until a Windows build/stage path is defined.

## Fit Scoring

| Candidate | Fit | Impact | Effort | Risk | Priority | Decision |
|---|---:|---:|---:|---:|---:|---|
| Prove companion EXE + SHA sidecar on the live release channel before bumping `APP_VERSION` | High | High | M | M | P1 | Add |
| Build signed MSI/installer in the same item | Medium | High | L | H | P2 | Keep separate existing item |
| Adopt a full TUF repository before any companion update | Low | Medium | XL | H | P3 | Reject for now; too heavy for current lightweight updater |
| Add Sigstore/TUF after signed installer work | Medium | Medium | L | M | P3 | Defer; revisit after EXE sidecar proof |
| Keep sidecar optional forever | Low | Low | S | H | Reject | Reject for release-channel self-update because it weakens the update trust signal |

## Recommended Roadmap Item

- [ ] P1 - Prove the Astra Downloader self-update release-channel contract
  - Why: `/update` now compares the companion's local `APP_VERSION` to the raw
    `main` source and downloads `AstraDownloader.exe` from the latest GitHub
    Release, but the latest public release does not include that EXE or its
    `.sha256` sidecar. A future source version bump can therefore advertise an
    update before the release channel can serve or verify the payload.
  - Evidence: `astra_downloader/astra_downloader.py:94`, `:128-130`,
    `:432-441`, `:1296-1339`, and `:3177-3185`;
    `scripts/generate-release-manifest.js:10`, `:72-89`, `:101-112`, and
    `:134-139`; `astra_downloader/build.py:3-4`, `:31`, and `:96-99`;
    `.github/workflows/build.yml:16` and `:38-47`;
    `docs/signing-keys.md:198-216`;
    `docs/research-cycle-8-ci-release-integrity.md:118`, `:202-203`, and
    `:280-281`; latest-release probe for `v4.46.0` found no
    `AstraDownloader.exe` or `AstraDownloader.exe.sha256`.
  - Touches: `astra_downloader/build.py` or a companion staging script,
    `scripts/generate-release-manifest.js`, `docs/signing-keys.md`,
    `.github/workflows/build.yml` if a Windows CI job is chosen,
    `astra_downloader/astra_downloader.py`, and
    `astra_downloader/test_astra_downloader.py`.
  - Acceptance: a documented local or CI-safe path stages
    `AstraDownloader.exe` in `build/` before `npm run release:manifest`;
    `scripts/generate-release-manifest.js` emits `AstraDownloader.exe.sha256`
    and includes the EXE/sidecar in the manifest and `SHA256SUMS` whenever the
    EXE is present; release docs state whether the companion EXE attaches to
    the same product release or a separate companion release, and how
    `APP_VERSION` relates to the selected release tag/source; `APP_VERSION` is
    not bumped above the deployed version until the intended update release
    contains both assets; release-channel self-update fails clearly when the
    sidecar is missing after update-channel activation, or docs explain the
    residual risk if optional hash behavior is intentionally retained; targeted
    tests cover missing asset, missing sidecar, generated sidecar, manifest
    inclusion, and successful hash verification; a live dry-run downloads the
    EXE and sidecar and compares hashes. The signed MSI row remains open unless
    signing is also funded and shipped.
  - Verify: `py -3.12 astra_downloader/build.py`; stage the EXE into `build/`
    by the new documented path; `npm run release:manifest`; `Get-FileHash
    build\AstraDownloader.exe -Algorithm SHA256`; `Get-Content
    build\AstraDownloader.exe.sha256`; inspect `build\release-manifest.json`
    and `build\SHA256SUMS`; `py -3.12 -m pytest
    astra_downloader/test_astra_downloader.py -q`; for the release dry-run,
    `gh release view <tag> --json assets`, `gh release download <tag> -p
    AstraDownloader.exe -p AstraDownloader.exe.sha256`, and a local hash
    comparison.
  - Complexity: M

## Rejections And Deferrals

- Full signed MSI/installer packaging is not rejected; it remains the existing
  P2 trust/onboarding item because it depends on signing budget and submission
  intent.
- A full TUF metadata repository is premature for this pass. The smaller
  requirement is an explicit EXE asset, hash sidecar, release manifest coverage,
  and dry-run proof.
- Relying on raw `main` as the only version signal is acceptable for an early
  local-first project only if it is paired with release-asset readiness checks.
  The build lane should either preserve the current source-version probe and add
  a strict release proof, or move to a release manifest/version endpoint that
  cannot advertise a version before the payload is present.

## Self-Audit

- Recommendation count: 1 new roadmap item.
- Duplicates merged: Cycle 8 companion-hash notes were cited instead of
  re-adding the broader release-integrity item.
- Done marks changed: none.
- Source coverage: 36 distinct external URLs plus live repo file references and
  latest-release probe evidence.
- Security covered: hash sidecar, release manifest, provenance/attestation,
  signed-installer separation, version/source consistency.
- Accessibility/i18n/UI covered: intentionally not central to this release
  contract; existing overlay a11y and locale-proofing rows remain current.
- Observability covered: log/error-state requirement for missing sidecar/asset.
- Testing covered: generated manifest, missing sidecar/asset, successful hash
  verification, and live `gh release download` dry-run.
