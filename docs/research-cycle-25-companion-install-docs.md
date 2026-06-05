# Research Cycle 25 - Companion Install Documentation

Date: 2026-06-04

## Executive Summary

The README installation path covers Chrome/Edge/Brave, Firefox, and userscript
installs, then later tells users that downloads use the Astra Downloader local
companion. It does not give a standalone companion setup/update section or state
whether the latest release contains a companion binary. The current release
artifact list also omits `AstraDownloader.exe`, which matches the live release
state and Cycle 22's release-channel finding.

This should be a documentation/release-readiness row, not an installer build row.
The signed installer/MSI item and Cycle 22 release-channel proof remain separate.
The missing piece here is truthful user-facing install guidance: what users can
install today, where the companion is expected to come from, what release assets
will prove it when shipped, and how Deno / PO-token prerequisites relate to the
companion.

Implementation update 2026-06-05:

- README now has a standalone Astra Downloader companion setup section.
- The setup section states that latest release `v4.46.0` does not include
  `AstraDownloader.exe` or `AstraDownloader.exe.sha256`.
- README documents the current Windows source-checkout launch path and links the
  Downloads feature note back to companion setup.
- Deno and PO-token provider setup are framed as companion prerequisites, not
  browser extension install steps.
- `docs/signing-keys.md` now guards README/release notes against advertising a
  downloadable companion until both EXE and sidecar assets exist.
- Detailed implementation notes live in
  `docs/audit/2026-06-05-companion-install-docs.md`.

## Scope And Anti-Duplication

- Cycle 22 queues the EXE/sidecar/update-channel release proof.
- The existing signed installer/MSI row covers signing and Windows package trust.
- The shipped first-run onboarding row covers in-app companion prompts.
- This Cycle 25 item covers README/release documentation so users can understand
  the companion before or during installation, even when the in-app prompt is not
  visible yet.

## Local Evidence

- `README.md:26-55` installation covers browser extension ZIP/folder, Firefox
  XPI, and userscript install paths only.
- `README.md:135` says downloads use Astra Downloader, the local yt-dlp +
  ffmpeg companion, and that store-safe artifacts stop there while GitHub-full
  can show Cobalt fallback when the companion is offline.
- `README.md:137-171` documents PO-token provider and Deno runtime prerequisites
  for robust downloads, but it assumes the companion context already exists.
- `README.md:367-373` release output list includes eight profile-split extension
  artifacts, userscript, SBOM, release manifest, and checksums. It does not list
  `AstraDownloader.exe` or `AstraDownloader.exe.sha256`.
- `ROADMAP.md:108-118` says the `/update` endpoint shipped but `APP_VERSION`
  remains frozen until a matching companion binary release is built and
  published.
- `ROADMAP.md:151-156` keeps signed installer/MSI open and deferred.
- `ROADMAP.md` Cycle 22 now queues release-channel proof for
  `AstraDownloader.exe` and `.sha256`.
- `ROADMAP.md:1616-1638` says first-run companion onboarding, setup/retry
  actions, and download health/history panels shipped.
- `docs/signing-keys.md:217-229` documents CRX/XPI publication paths but not a
  companion setup path.
- Latest release `v4.46.0` does not attach `AstraDownloader.exe` or
  `AstraDownloader.exe.sha256` according to the Cycle 22 live release probe.

## External Sources Reviewed

1. GitHub Docs - About releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
2. GitHub Docs - Managing releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
3. GitHub Docs - Linking to releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
4. GitHub REST API - Release assets:
   https://docs.github.com/en/rest/releases/assets
5. GitHub CLI - `gh release download`:
   https://cli.github.com/manual/gh_release_download
6. GitHub CLI - `gh release verify-asset`:
   https://cli.github.com/manual/gh_release_verify-asset
7. GitHub Docs - Artifact attestations:
   https://docs.github.com/en/actions/concepts/security/artifact-attestations
8. GitHub Docs - README files:
   https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
9. Chrome for Developers - Publish in the Chrome Web Store:
   https://developer.chrome.com/docs/webstore/publish
10. Chrome Web Store - Program policies:
    https://developer.chrome.com/docs/webstore/program-policies/policies
11. MDN - Installing extensions:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing
12. Firefox Extension Workshop - Signing and distribution:
    https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
13. Firefox Extension Workshop - Self-distribution:
    https://extensionworkshop.com/documentation/publish/self-distribution/
14. PyInstaller usage:
    https://pyinstaller.org/en/stable/usage.html
15. PyInstaller operating mode:
    https://pyinstaller.org/en/stable/operating-mode.html
16. Microsoft SignTool:
    https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
17. Microsoft SmartScreen:
    https://learn.microsoft.com/en-us/windows/security/application-security/application-control/smart-app-control/microsoft-defender-smartscreen
18. Microsoft Windows app packaging overview:
    https://learn.microsoft.com/en-us/windows/msix/overview
19. Microsoft MSIX signing overview:
    https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview
20. yt-dlp installation:
    https://github.com/yt-dlp/yt-dlp/wiki/Installation
21. yt-dlp releases:
    https://github.com/yt-dlp/yt-dlp/releases
22. Deno installation:
    https://docs.deno.com/runtime/getting_started/installation/
23. bgutil-ytdlp-pot-provider:
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider
24. Tampermonkey FAQ:
    https://www.tampermonkey.net/faq.php
25. Violentmonkey docs:
    https://violentmonkey.github.io/
26. CISA SBOM overview:
    https://www.cisa.gov/sbom
27. SLSA provenance v1.0:
    https://slsa.dev/spec/v1.0/provenance
28. Sigstore cosign overview:
    https://docs.sigstore.dev/cosign/overview/
29. The Update Framework:
    https://theupdateframework.io/
30. Tauri updater plugin:
    https://v2.tauri.app/plugin/updater/
31. Electron `autoUpdater`:
    https://www.electronjs.org/docs/latest/api/auto-updater
32. WinSparkle:
    https://winsparkle.org/

## Landscape Findings

- Projects that ship a browser extension plus a local helper need separate
  install guidance for each trust boundary. Browser install instructions do not
  explain where a Windows helper binary comes from.
- GitHub Releases support publishing companion binaries and sidecars alongside
  extension artifacts, but README should not promise a companion asset until the
  live release contains it.
- Microsoft signing and SmartScreen sources reinforce that unsigned helper
  binaries need clear trust caveats until the signed installer/MSI row ships.
- yt-dlp, Deno, and PO-token provider docs show that download reliability now
  depends on companion-adjacent prerequisites. Those prerequisites need a clear
  parent section that first explains how users get and run the companion.

## Fit Scoring

| Candidate | Fit | Impact | Effort | Risk | Priority | Decision |
|---|---:|---:|---:|---:|---:|---|
| Add truthful README/release docs for companion install/update state | High | Medium | S | Low | P2 | Add |
| Fold into signed MSI only | Medium | Medium | S | Medium | P3 | Reject; docs can improve before signing |
| Promise an EXE asset before Cycle 22 ships | Low | Low | S | High | Reject | Would mislead users |
| Add a full Windows setup guide under docs now | Medium | Medium | M | Low | P3 | Optional after release asset proof |

## Recommended Roadmap Item

- [x] P2 - Document the Astra Downloader companion install and release-asset path
  - Why: README installation covers extension and userscript paths, then later
    says downloads use the Astra Downloader companion. Users need a truthful
    setup section that explains the current companion state, release asset
    availability, prerequisites, and how this differs from the signed
    installer/MSI and self-update release-channel work.
  - Evidence: `README.md:26-55`, `README.md:135`, `README.md:137-171`, and
    `README.md:367-373`; `ROADMAP.md:108-118`, `:151-156`, Cycle 22 release
    channel item, and `ROADMAP.md:1616-1638`; `docs/signing-keys.md:217-229`;
    latest release `v4.46.0` lacks `AstraDownloader.exe` and
    `AstraDownloader.exe.sha256`. [Verified]
  - Touches: `README.md`, `docs/signing-keys.md`, possibly a companion setup doc
    under `docs/`, and release notes/checklist text once the EXE asset exists.
  - Acceptance: README has a distinct Astra Downloader companion setup section;
    it truthfully states whether the latest release contains a companion EXE and
    hash sidecar; it links or describes the in-app setup prompt, Deno runtime,
    and PO-token provider prerequisites without implying they are browser
    extension installs; the release-output list mentions companion assets only
    when the Cycle 22 release-channel item ships, or explicitly labels them as
    pending; the signed installer/MSI caveat remains separate.
  - Verify: `rg -n "Astra Downloader|AstraDownloader.exe|Deno|PO Token"
    README.md docs/signing-keys.md docs`; `gh release view --json assets`;
    `npm run check`; docs-only diff review confirms no feature source, build
    file, manifest, runtime config, or generated artifact changed unless paired
    with the actual release-asset implementation.
  - Status 2026-06-05: shipped in README, signing/release guardrails, and a
    README hardening regression. The companion EXE/sidecar release-channel proof
    and signed installer/MSI roadmap items remain separate.
  - Complexity: S

## Rejections And Deferrals

- Do not promise a downloadable `AstraDownloader.exe` until the release asset
  exists and the hash sidecar path is proven.
- Do not merge this into the signed MSI item; documentation can tell the truth
  about an unsigned/manual companion path while the signing budget remains open.
- A deeper Windows setup guide can wait until Cycle 22's EXE/sidecar contract is
  implemented.

## Self-Audit

- Recommendation count: 1 new roadmap item.
- Duplicates merged: Cycle 22 release-channel proof and signed installer/MSI
  remain separate and are cited.
- Done marks changed: the recommended companion setup documentation item is now
  marked shipped after implementation verification.
- Source coverage: 32 external URLs plus repo file references and latest-release
  evidence.
- Security/release covered: unsigned helper caveat, hash sidecar, SBOM/provenance
  context, local signing separation.
- Testing/docs covered: README/signing-key doc verification, live release asset
  probe, and docs-only change scope.
