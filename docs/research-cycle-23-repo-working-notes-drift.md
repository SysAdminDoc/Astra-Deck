# Research Cycle 23 - Repo Working Notes Drift

Date: 2026-06-04

## Executive Summary

`AGENTS.md` delegates this repo's operating instructions to `CLAUDE.md`, but
the delegated file now mixes accurate current notes with stale historical
handoff text. The current README, architecture map, CWS/AMO checklist, signing
key policy, and Firefox manifest patch all describe the live product more
accurately than parts of `CLAUDE.md`.

The drift is not a feature-code bug, but it is an execution-risk item for future
repo work. A new contributor or build operator is told to read `CLAUDE.md` first,
then can encounter a missing handoff-log reference, an old Firefox 128+ support
statement, a release-flow line that says to push `main` and run `gh release
create`, and historical five-artifact release summaries that predate the current
profile-split eight-artifact release policy.

## Scope And Anti-Duplication

- Cycle 14 already carries a P2 item to reconcile broader release automation
  docs with the maintainer-local artifact contract. This pass should not replace
  that item.
- Cycle 23 focuses on the repo-local working-note contract because `AGENTS.md`
  explicitly points future workers there before they read the rest of the repo.
- The build lane can close this item with a docs-only update. Feature source,
  tests, workflow behavior, runtime config, and generated artifacts do not need
  to change unless the implementer chooses to add a doc-drift sentinel.

## Local Evidence

### Delegated Instruction Source

- `AGENTS.md:1-7` says this repo's working notes, stack, build commands,
  architecture, and gotchas live in `./CLAUDE.md`, and that file should be read
  at the start of every session.
- `CLAUDE.md:3-4` points readers to `CODEX-CHANGELOG.md` for the latest repair
  log, touched files, verification commands, and known doc drift.
- `Test-Path -LiteralPath CODEX-CHANGELOG.md` returned `False`.

### Release Flow Drift

- `CLAUDE.md:68-71` says the standard release flow is bump/build, commit,
  push `main`, then `gh release create vX.Y.Z` with profile-split build
  artifacts.
- `docs/signing-keys.md:185-193` says `ytkit.pem` lives outside the repo and
  must never enter CI. It also says CI does not publish GitHub Releases; the tag
  workflow builds validation artifacts, emits manifest/checksum files, and
  attests CI-built artifacts only, while the maintainer builds public CRX
  artifacts locally.
- `docs/signing-keys.md:198-215` gives the current local release checklist:
  version check, local tests, local `npm run build:userscript`, SBOM, release
  manifest, release asset upload, and digest comparison.
- `.github/workflows/build.yml:38-47` builds profile/userscript artifacts,
  emits the release manifest, and uploads `build/*` as a workflow artifact.
- `.github/workflows/build.yml:54-64` creates build/SBOM attestations on tags.
- Direct push to `main` is rejected by branch protection. The most recent
  research cycles had to publish branches and merge PRs because `main` expects
  required status checks before updates.

### Firefox Support Drift

- `CLAUDE.md:28` correctly says Firefox artifacts now require Firefox 140+ and
  `scripts/manifest-patch.js` injects built-in data consent categories.
- `CLAUDE.md:73-77` still says `strict_min_version: "128.0"` and requires
  Firefox 128+.
- `CLAUDE.md:432-435` repeats that the extension manifest passes
  `strict_min_version: 128.0`.
- `scripts/manifest-patch.js:7` defines
  `FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION = '140.0'`.
- `scripts/manifest-patch.js:18-24` injects
  `browser_specific_settings.gecko.strict_min_version` and required
  `data_collection_permissions`.
- `README.md:49`, `README.md:342-344`, `docs/architecture.md:7`, and
  `docs/cws-submission-checklist.md:170-174` all describe Firefox 140+.

### Historical State Drift

- `CLAUDE.md:382-385` says the v4.0.0 milestone shipped five artifacts.
- `CLAUDE.md:706-708` says all five artifacts were attached to a release.
- `CLAUDE.md:884-889` describes a v3.20.1 release and test count as current
  state within an older continuation brief.
- The live README and `docs/signing-keys.md` now expect eight profile-split
  extension artifacts for full releases, plus userscript/SBOM/manifest/checksum
  assets. The latest public release `v4.46.0` attaches the eight profile-split
  extension artifacts, userscript, SBOM, `release-manifest.json`, and
  `SHA256SUMS`.

### Existing Related Queue

- `ROADMAP.md` Cycle 14 already has `P2 - Reconcile release automation docs with
  maintainer-local artifact contract`, with `docs/architecture.md:127` as a
  still-relevant evidence point because it says CI runs `gh release create`.
- Cycle 23 should add a separate repo-local working-notes item rather than
  overloading the Cycle 14 release-doc item. The new item covers the delegated
  worker instructions and missing handoff-log reference; Cycle 14 can still
  close the architecture/release-doc wording.

## External Sources Reviewed

1. GitHub Docs - About README files:
   https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
2. GitHub Docs - Contributor guidelines:
   https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors
3. GitHub Docs - Issue and PR templates:
   https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests
4. GitHub Docs - About releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
5. GitHub Docs - Managing releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
6. GitHub Docs - Linking to releases:
   https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases
7. GitHub REST API - Release assets:
   https://docs.github.com/en/rest/releases/assets
8. GitHub REST API - Releases:
   https://docs.github.com/en/rest/releases/releases
9. GitHub CLI - `gh release upload`:
   https://cli.github.com/manual/gh_release_upload
10. GitHub CLI - `gh release download`:
    https://cli.github.com/manual/gh_release_download
11. GitHub CLI - `gh release verify-asset`:
    https://cli.github.com/manual/gh_release_verify-asset
12. GitHub Docs - Protected branches:
    https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
13. GitHub Docs - Branch protection rules:
    https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule
14. GitHub Docs - Repository rulesets:
    https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
15. GitHub Docs - Artifact attestations:
    https://docs.github.com/en/actions/concepts/security/artifact-attestations
16. GitHub Docs - Use artifact attestations:
    https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
17. GitHub Docs - Store workflow artifacts:
    https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow
18. `actions/upload-artifact` README:
    https://github.com/actions/upload-artifact
19. MDN - `browser_specific_settings`:
    https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
20. Firefox Extension Workshop - Built-in data consent:
    https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
21. Firefox Extension Workshop - Signing and distribution:
    https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
22. Firefox Extension Workshop - Submitting an add-on:
    https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
23. Firefox Extension Workshop - Source code submission:
    https://extensionworkshop.com/documentation/publish/source-code-submission/
24. Chrome for Developers - Chrome userScripts change:
    https://developer.chrome.com/blog/chrome-userscript
25. Chrome for Developers - `chrome.userScripts` API:
    https://developer.chrome.com/docs/extensions/reference/api/userScripts
26. Chrome Web Store - MV3 requirements:
    https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
27. Chrome Web Store - Program policies:
    https://developer.chrome.com/docs/webstore/program-policies/policies
28. Chrome Web Store - Privacy fields:
    https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
29. Chrome Extensions - Manifest file format:
    https://developer.chrome.com/docs/extensions/reference/manifest
30. Chrome Extensions - Match patterns:
    https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
31. Tampermonkey FAQ - Chrome user scripts toggle:
    https://www.tampermonkey.net/faq.php?ext=dhdg&q=Q209
32. OpenSSF Scorecard:
    https://github.com/ossf/scorecard
33. OpenSSF Best Practices Badge:
    https://www.bestpractices.dev/en
34. CISA SBOM overview:
    https://www.cisa.gov/sbom
35. SLSA provenance v1.0:
    https://slsa.dev/spec/v1.0/provenance
36. Sigstore cosign overview:
    https://docs.sigstore.dev/cosign/overview/

## Landscape Findings

- GitHub treats README and CONTRIBUTING files as surfaced project-contract
  documents. A repo-local operator file has the same practical role for this
  project because `AGENTS.md` names it as the first working-note source.
- GitHub protected-branch guidance and this repo's observed `main` rejection
  support replacing direct-push wording with a branch/PR/required-check flow.
- GitHub release docs and CLI release commands support a maintainer-local
  release publication path, but docs should be explicit about which artifacts
  come from local signing, which come from CI artifacts, and which are only
  validation/provenance evidence.
- Mozilla's current Firefox data-consent docs support the repo's Firefox 140+
  choice: old Firefox versions require either custom consent handling or a
  higher `strict_min_version`. Astra's live manifest patch chose the higher
  minimum.
- Chrome's user-scripts toggle change confirms that the current CONTRIBUTING and
  signing-key notes around Chrome 138+ are fresher than old historical release
  notes.
- Repository health guidance from GitHub/OpenSSF favors durable, current
  contributor/operator docs over long mixed-current/historical files with broken
  references.

## Fit Scoring

| Candidate | Fit | Impact | Effort | Risk | Priority | Decision |
|---|---:|---:|---:|---:|---:|---|
| Refresh repo-local working notes and missing handoff reference | High | Medium | S/M | Low | P2 | Add |
| Merge into Cycle 14 release-doc reconciliation only | Medium | Medium | S | Low | P3 | Reject; misses missing handoff and Firefox drift |
| Rewrite all historical release notes in `CLAUDE.md` | Low | Low | L | M | P3 | Reject; only stale current-looking sections need action |
| Add a doc-drift sentinel for key strings | Medium | Medium | M | Low | P3 | Optional acceptance, not required |

## Recommended Roadmap Item

- [ ] P2 - Reconcile repo-local working notes with current release and browser-support contracts
  - Why: future repo work starts from `AGENTS.md`, which delegates to
    `CLAUDE.md`; that file now references a missing handoff log, includes stale
    Firefox 128+ statements, and describes direct `main` push / `gh release
    create` release flow even though protected `main`, local `ytkit.pem`
    signing, profile-split release artifacts, and Firefox 140+ data-consent
    requirements are the current contract.
  - Evidence: `AGENTS.md:1-7`; `CLAUDE.md:3-4`, `:68-76`, `:382-385`,
    `:432-435`, `:706-708`, and `:884-889`; `Test-Path
    CODEX-CHANGELOG.md` returns `False`; `scripts/manifest-patch.js:7` and
    `:18-24`; `README.md:49` and `:342-344`; `docs/architecture.md:7` and
    `:127`; `docs/cws-submission-checklist.md:170-174`;
    `docs/signing-keys.md:185-193` and `:198-215`; observed protected-branch
    rejection for direct `main` push. [Verified]
  - Touches: `CLAUDE.md`, possibly `docs/architecture.md`,
    `docs/signing-keys.md`, `README.md`, `CONTRIBUTING.md`, and an optional
    docs-drift check if the implementer wants one.
  - Acceptance: the missing handoff-log pointer is removed, replaced with an
    existing tracked file, or backed by a real tracked log; current release
    instructions describe branch/PR publication for protected `main`, local
    `ytkit.pem` signing, eight profile-split extension artifacts, userscript,
    SBOM, manifest/checksum assets, and the separate companion EXE release item;
    every current browser-support statement says Firefox 140+ for extension
    artifacts and references `scripts/manifest-patch.js` data-consent behavior;
    old v3/v4 release summaries are clearly marked as historical or moved under
    an archive-style section so they cannot be mistaken for current state; the
    Cycle 14 release-doc item is either updated or cross-linked so
    `docs/architecture.md` no longer contradicts the signing-key release policy.
  - Verify: `Test-Path CODEX-CHANGELOG.md` is true only if the file is meant to
    exist, otherwise `rg -n "CODEX-CHANGELOG" CLAUDE.md AGENTS.md docs README.md`
    returns no stale pointer; `rg -n "strict_min_version: \"128\\.0\"|requires
    Firefox 128|Firefox 128\\+" CLAUDE.md README.md docs` returns no current
    contract statements; `rg -n "push main|gh release create|All 5 artifacts"
    CLAUDE.md docs README.md` returns only historical sections or no matches;
    `node scripts/check-versions.js`; and docs-only diff review confirms no
    feature source or generated artifact changed unless a docs-drift check was
    deliberately added.
  - Complexity: S/M

## Rejections And Deferrals

- Rewriting the whole working-notes file is unnecessary. The build lane should
  keep useful historical context, but current-looking instructions must be
  accurate and broken pointers must be removed or satisfied.
- Cycle 14 should remain in the roadmap because `docs/architecture.md:127`
  still has release-flow drift independent of the repo-local working-note issue.
- A new automated docs-drift check could help, but it is optional. A precise
  docs update plus targeted `rg` verification is enough to close this P2 item.

## Self-Audit

- Recommendation count: 1 new roadmap item.
- Duplicates merged: Cycle 14 release-doc item is cited and preserved rather
  than overwritten.
- Done marks changed: none.
- Source coverage: 36 external URLs plus repo file references and live
  `Test-Path` / protected-branch evidence.
- Security/release covered: local signing key custody, protected branch flow,
  release assets, attestations, companion release separation.
- Accessibility/i18n/UI covered: not central; existing overlay a11y and locale
  proofing rows remain current.
- Testing/docs covered: targeted `rg` probes, version check, and optional
  docs-drift sentinel.
