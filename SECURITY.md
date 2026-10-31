# Security Policy

## Supported Versions

| Version | Support status |
|---------|----------------|
| The latest published GitHub release, and the `main` branch | Supported |
| Earlier v4 releases | Best effort only; update to the latest release first unless the report is about upgrade, migration, or signing-key rotation |
| Anything before v4 | Unsupported |
| Archived snapshots under `archive/` or `docs/archive/` | Unsupported except as forensic evidence for a current vulnerability |

Astra Deck is self-distributed and has no store listing yet, so "latest
release" means the newest tag on this repository rather than a store version.

## What You Can Check Yourself

Releases are built on one machine with no CI. Here's what you can confirm today and what you can't.

- **Whether a download is intact.** Release builds carry `release-manifest.json` and `SHA256SUMS` covering every artifact. The steps are in [Verifying a download](README.md#verifying-a-download).
- **Who built it.** You can't prove that yet. No release signing key is published, so `SHA256SUMS.sig` is absent, and the release path doesn't produce a build attestation. Treat releases as unsigned and prefer the source tree until `allowed-signers` carries a key.
- **What went into the build.** Release builds also carry a CycloneDX SBOM for the npm build and packaging tooling. The extension itself bundles no npm packages.
- **What changed and when.** Every commit is public and `CHANGELOG.md` records each change. The userscripts are generated from the extension source, so `node sync-userscript.js` followed by `node scripts/check-userscript-drift.js` shows whether the committed files match it.
- **What each build can reach.** Store-safe builds keep the authenticated companion handoff but drop AI, Ollama and user-selected remote origins. GitHub-full keeps those behind runtime prompts, with Cobalt limited to an authorized self-hosted instance.
- **What leaves in a settings export.** Exports strip API keys, tokens and other secrets.
- **What can change without a release.** `selector-packs.json` and `feature-disable-feed.csv` load at runtime, and both are signed (see High-Priority Classes below). The breakage feed can only pause a shipped feature. A Video Hider list you subscribe to also refreshes on its own, and only if you added one.

## Report a Vulnerability

Use GitHub private vulnerability reporting from the repository Security tab for
sensitive reports. Do not open a public issue for vulnerabilities, suspected
credential exposure, signing-key incidents, exploit chains, or private logs.

Include:

- Affected Astra Deck version or commit.
- Browser, operating system, and install surface (`store-safe`, `github-full`,
  userscript, or Astra Downloader companion).
- Short impact summary and the vulnerable behavior.
- Minimal reproduction steps with secrets, account data, and local paths
  redacted.
- Relevant release artifact names, checksums, extension IDs, or advisory links
  when the issue involves packaging or provenance.

Do not include:

- API keys, cookies, bearer tokens, signing keys, or private repository data.
- Working exploit payloads beyond the minimum needed to explain impact.
- Full private logs, personal data, or unredacted local filesystem paths.
- YouTube account data that is not necessary to validate the issue.

Public issues are still appropriate for non-sensitive bugs, usability problems,
documentation mistakes, and feature requests.

## Response Expectations

- Acknowledgement within 5 business days.
- Initial triage within 10 business days.
- Coordinated disclosure or GitHub Security Advisory timing after a fix path is
  understood.
- Signing-key exposure, active exploitation, extension permission bypass, and
  companion loopback authentication bypass reports are treated as urgent where
  maintainer availability permits.

## High-Priority Classes

- Signing-key exposure or release-key custody failure. Releases currently ship
  ZIP packages plus an unsigned XPI and the userscript, so this covers the CRX
  maintainer key held for self-hosted builds and any key used for a future
  store or AMO listing. Treat the unsigned XPI as unverified by design: report
  its lack of a signature as a packaging gap only if a release claims otherwise.
- Extension permission, host-permission, CSP, or fetch-proxy bypass.
- Astra Downloader loopback authentication, Host-header, DNS-rebinding, or
  request-validation bypass.
- Remote-feed authenticity. `selector-packs.json` and
  `feature-disable-feed.csv` are fetched at runtime and can change shipped
  behavior without a release. Both carry a detached ECDSA P-256 signature
  verified in the service worker against a public key inside the package,
  and both fail closed to the last-known-good copy. The breakage feed also
  signs a sequence and an expiry, and the worker refuses older sequences and
  expired copies. Report anything that gets an unsigned, mis-signed,
  substituted, rolled-back, or expired feed accepted.
- Dependency compromise or malicious package/update-chain behavior.
- Release artifact, checksum, SBOM, attestation, or provenance mismatch.
- Sensitive export, diagnostics, transcript, cookie, or BYO-key disclosure.
