# Astra Deck Research Feature Plan - 2026-06-05

This report is an additive planning artifact. `ROADMAP.md` remains the canonical
queue for committed work, while this file consolidates product research,
repository evidence, ecosystem constraints, and implementation-ready feature
recommendations into one report.

## Executive Summary

Astra Deck is already a broad YouTube power-user suite rather than a narrow
browser extension. At the reviewed `main` snapshot (`97c7f0f`,
`v4.46.0-36-g97c7f0f`), it combines:

- A Manifest V3 browser extension with a service worker, popup settings surface,
  injected YouTube feature runtime, store-safe and GitHub-full profiles, and
  release automation for Chrome, Firefox, Edge, Brave, and userscript builds.
- A userscript distribution path via `YTKit.user.js`.
- The Astra Downloader local companion (`astra_downloader/`) built with Flask,
  PyQt6, yt-dlp, ffmpeg, a loopback API, and optional PO-token support.
- A documented data-flow and profile model separating store-safe features from
  riskier enrichment and local companion capabilities.

The strongest product opportunity is not another large batch of independent
toggles. The repo already exposes roughly 231 feature definitions and 362
settings schema entries. The next step should be trust, capability discovery,
release reliability, optional-permission ergonomics, and resilience against
YouTube DOM churn. Those investments make the existing feature surface easier to
ship, review, and explain.

Highest-priority work:

1. **Resolve public trust blockers before feature expansion.** The open Google
   API key secret-scanning alert, CRX signing-key custody gap, missing
   `SECURITY.md`, missing private vulnerability reporting, missing CodeQL setup,
   and dependency graph/dependency review blocker are higher-value than new UI.
2. **Make the companion downloader install/update path first-class.** The latest
   public release (`v4.46.0`, published 2026-06-04) ships profile-split
   extension artifacts, SBOM, release manifest, checksums, and userscript, but no
   `AstraDownloader.exe` asset. Downloader health UI already exists in the
   popup, so the release-channel contract must catch up.
3. **Convert optional enrichment hosts to runtime-granted access.** Chrome
   guidance explicitly supports `optional_host_permissions`, and the current
   manifest grants many enrichment hosts at install time. Runtime prompts would
   improve store review posture and user trust.
4. **Expand capture fixtures to the surfaces Astra Deck modifies.** The current
   MHTML builder is centered on watch/live-chat coverage while open roadmap work
   calls for Shorts, search, channel, history, watch-later, embed, and
   notifications fixtures. This is the main path to reducing YouTube DOM
   breakage regressions.
5. **Use product differentiation from existing strengths.** Astra Deck can be
   positioned around privacy-aware enrichment, capability-aware local downloads,
   subscriptions intelligence, accessibility controls, and transparent data-flow
   explanations.

## Evidence Reviewed

Local repository evidence:

- `README.md` - current product description, install paths, release artifact
  matrix, downloader companion notes, Deno/bgutil PO-token workflow.
- `ROADMAP.md` - active queue through research Cycle 25, including MHTML fixture
  expansion, downloader installer/update docs, optional permissions, CodeQL,
  security policy, signing custody, dependency graph, and accessibility audit.
- `RESEARCH_REPORT.md` and `docs/research-cycle-*.md` - cumulative research
  reports and recent cycle-specific findings.
- `HARDENING.md` - historical security and QA hardening log.
- `docs/architecture.md` - extension, userscript, downloader, popup, trust
  boundaries, and release architecture.
- `package.json`, `.nvmrc`, `pytest.ini` - Node 22, JS/Python test and check
  gates, downloader test config.
- `extension/manifest.json` - Manifest V3 permissions, content scripts,
  extension CSP, and host grants.
- `extension/core/settings-schema.js` - schema categories, risk tiers, profile
  metadata, capability gates, and settings count.
- `extension/core/data-flow.js` - origin catalog, consent/export metadata, and
  coverage-gap scanner.
- `extension/core/policy-profile.js` - store-safe vs GitHub-full filtering and
  export scrubbing.
- `extension/core/capability-probe.js` - local companion, Ollama, and browser
  summarizer capability probes.
- `extension/popup.html` and `extension/popup.js` - current settings, profile,
  diagnostics, data-flow, and downloader health surfaces.
- `extension/ytkit.js` - feature definitions, YouTube DOM integrations, and one
  stale runtime reference to the retired options page.
- `astra_downloader/requirements.txt` and `astra_downloader/build.py` - current
  downloader dependencies and executable build path.

Live GitHub evidence checked on 2026-06-05:

- Latest release is `v4.46.0`, published 2026-06-04. It includes extension
  artifacts, SBOM, release manifest, checksums, and userscript artifacts, but no
  companion downloader executable asset.
- Open pull requests #10 and #11 are dependency updates with Dependency review
  failing while other checks are successful. This supports the roadmap item to
  enable dependency graph before requiring dependency review.
- Main branch protection requires the JS check gate, Python dependency audit,
  and Python downloader tests; strict status checks and conversation resolution
  are enabled.
- Code scanning API returned "no analysis found", indicating CodeQL/code
  scanning has not started producing results.
- Secret scanning reports one open Google API key alert in historical
  `YTKit.user.js`. The secret value is intentionally not reproduced here.

External sources reviewed:

- Chrome extension permissions and optional host permissions:
  https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome Web Store Manifest V3 remote-code requirements:
  https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Chrome Web Store program policies and user-data requirements:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Firefox Manifest V3 migration guide:
  https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/
- Firefox signing and distribution overview:
  https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- GitHub CodeQL/code scanning setup:
  https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning
- GitHub private vulnerability reporting:
  https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/privately-reporting-a-security-vulnerability
- GitHub dependency graph:
  https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependency-graph
- GitHub Dependabot alerts:
  https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configuring-dependabot-alerts
- GitHub CODEOWNERS:
  https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- WCAG 2.2 target-size guidance:
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- yt-dlp:
  https://github.com/yt-dlp/yt-dlp
- bgutil yt-dlp PO-token provider:
  https://github.com/Brainicism/bgutil-ytdlp-pot-provider
- SponsorBlock:
  https://github.com/ajayyy/SponsorBlock
- DeArrow:
  https://github.com/ajayyy/DeArrow
- Return YouTube Dislike:
  https://github.com/Anarios/return-youtube-dislike
- BlockTube:
  https://github.com/amitbl/blocktube
- Improve YouTube:
  https://github.com/code-charity/youtube
- PocketTube:
  https://pockettube.io/

## Current Product Map

### Extension Runtime

The extension is a Manifest V3 package with:

- A service worker for background behavior and extension APIs.
- `ytkit-main.js` injected into the main world at `document_start`.
- Core and feature modules injected into YouTube pages at `document_idle`.
- Dedicated live-chat injection with `all_frames` support.
- Shared popup modules for settings, profile switching, diagnostics, selector
  health, capability probing, and downloader controls.
- Profile split behavior through `store-safe` and `github-full` metadata.

The manifest currently requests broad hosts up front: YouTube, youtu.be,
SponsorBlock, Return YouTube Dislike, Reddit, OpenAI, Anthropic, Gemini, Cobalt,
Ollama loopback, and Astra Downloader loopback. This is coherent for the
GitHub-full bundle, but high-friction for store review and first install.

### Settings and Feature Surface

The live settings schema contains 362 entries:

| Dimension | Count |
| --- | ---: |
| Boolean settings | 275 |
| String settings | 45 |
| Number settings | 25 |
| Object settings | 9 |
| Array settings | 6 |
| Null-placeholder settings | 2 |
| Store-safe profile settings | 345 |
| GitHub-full-only profile settings | 17 |
| Safe risk tier | 311 |
| API risk tier | 26 |
| Local companion risk tier | 9 |
| Store-risk tier | 9 |
| Experimental tier | 7 |

The settings categories show where the product is concentrated:

| Category | Count |
| --- | ---: |
| Playback/audio | 74 |
| Watch/player | 59 |
| Shell | 42 |
| Content filter | 31 |
| Enrichment | 24 |
| Research/local AI | 17 |
| Comments | 16 |
| Downloads | 15 |
| Navigation | 13 |
| Quality/codec | 12 |
| Privacy profiles | 10 |
| Feed | 10 |
| Accessibility/performance | 8 |
| Live chat | 8 |
| Subscriptions | 8 |
| Subtitles | 8 |
| Shorts | 4 |
| Developer diagnostics | 3 |

The feature definitions in `extension/ytkit.js` parse to roughly 231 feature
entries. The largest groups are watch page, video player, content filtering,
home/subscriptions, playback, theme, comments, advanced, and downloads. That
validates the README's "200+ features" framing, but it also means the biggest
new value is now discoverability, confidence, and targeted workflow depth.

### Profiles, Consent, and Data Flow

`extension/core/data-flow.js` defines 11 origin families and classifies them by
profile and consent/export behavior. Store-safe origins include YouTube,
YouTube image assets, SponsorBlock/DeArrow, Return YouTube Dislike, and Reddit.
GitHub-full origins include OpenAI, Anthropic, Gemini, Ollama loopback, Astra
Downloader loopback, and Cobalt.

`extension/core/policy-profile.js` filters settings for the selected profile and
scrubs key-like, secret-like, cookie, and auth values before export. This is a
strong architectural base. The next product step is to expose the same model as
a user-facing trust center and as automated release review evidence.

### Companion Downloader

The downloader is a substantial companion product, not a minor helper. It uses
yt-dlp, curl_cffi, Flask, Waitress, PyQt6, and ffmpeg. The popup already has
capability and health surfaces for the companion, including local port probing
and update actions.

The gap is release delivery. The current public release does not include
`AstraDownloader.exe`, even though the release-manifest generator can include
the executable and SHA256 sidecar if present in `build/`. Users can see
downloader UI without a complete, signed, documented, auto-verifiable install
path from the release page.

### Release and Quality Gates

The repository already has serious gates:

- `npm run check` combines syntax, version, i18n, settings, no-eval,
  Firefox injection, lint, accessibility, contrast, and dependency checks.
- `npm test` runs JS tests.
- Python downloader tests are configured with `pytest.ini`.
- Release automation produces profile-split artifacts, userscript output, SBOM,
  release manifest, and checksums.
- Main branch protection requires JS, Python audit, and Python downloader status
  checks.

The remaining quality problem is not absence of testing. It is coverage against
the highest-churn product surfaces: YouTube page variants, optional host
permission flows, cross-browser MV3 behavior, release asset completeness,
security scanning, and installer/update paths.

## Ecosystem and Competitive Position

### YouTube Extension Landscape

Astra Deck sits at the intersection of several established extension classes:

- **General enhancement suites**, such as Improve YouTube, emphasize many
  toggles for playback, layout, player controls, and content discovery.
- **Crowdsourced enrichment tools**, such as SponsorBlock, DeArrow, and Return
  YouTube Dislike, focus on one high-value shared-data integration.
- **Subscription managers**, such as PocketTube, focus on organizing channels,
  tags, groups, personal feeds, filters, sorting, and watched state.
- **Content blockers**, such as BlockTube, focus on local rules for video,
  channel, comment, Shorts, trend, and keyword suppression.
- **Downloader stacks**, such as yt-dlp and PO-token provider plugins, focus on
  keeping download extraction working as YouTube changes.

Astra Deck's differentiator is breadth plus governance: many controls, profile
split builds, local companion integration, data-flow cataloging, and release
automation. The product should lean into this instead of trying to beat every
specialist on their narrowest feature.

### Policy Constraints That Should Shape Features

Chrome's extension permission guidance supports runtime-granted optional
permissions and advises narrow permission use where possible. The Chrome Web
Store policy also requires accurate metadata, narrow permissions, transparent
user-data handling, secure auth handling, and clear disclosure of collection and
sharing. MV3 policy requires extension logic to be discernible from submitted
code; remote resources can be data/configuration, but remote logic is heavily
restricted.

Implication for Astra Deck:

- Use `optional_host_permissions` for enrichment providers and local companion
  hosts when a feature can work disabled by default.
- Keep provider integrations as data APIs, not remotely supplied behavior.
- Make every API-key, transcript, local model, downloader, and export flow
  visible in the data-flow panel.
- Build store-safe artifacts that do not request GitHub-full hosts at install
  time.

### Firefox Constraints

Firefox MV3 has service worker/event-page differences and more restrictive CSP
rules than legacy MV2 patterns. Firefox signing can be handled through AMO web
upload, `web-ext sign`, or AMO APIs, with public listing or self-distribution
depending on channel.

Implication for Astra Deck:

- Treat Firefox MV3 smoke testing as a release gate, not an afterthought.
- Keep the Firefox build's injected content script and popup behavior covered by
  automated checks.
- Record signed XPI provenance and update behavior in the release manifest.

### Accessibility Constraints

WCAG 2.2 target-size guidance makes 24 by 24 CSS pixels a baseline for many
interactive targets unless spacing exceptions apply. Astra Deck injects many
overlay controls into a dense YouTube UI, so target size, focus visibility,
keyboard behavior, contrast, and non-overlap need automated regression coverage.

Implication for Astra Deck:

- Treat overlay controls as product surfaces with accessibility budgets.
- Add fixture-backed checks for small buttons, cluster spacing, keyboard order,
  and focus visibility.
- Include popup and in-page overlay states in visual QA, not just static HTML.

## Strengths to Preserve

- **Profile architecture.** The store-safe/GitHub-full split is a real advantage
  for review and user trust.
- **Data-flow catalog.** The origin catalog and export metadata give the repo a
  strong privacy-review foundation.
- **Capability probing.** The popup can already detect browser summarizer,
  Astra Downloader, and Ollama availability.
- **Release artifact discipline.** SBOM, release manifest, SHA256SUMS, and
  profile split outputs are above the baseline for an extension project.
- **Local downloader ownership.** Shipping a local companion keeps heavy,
  policy-sensitive download work out of the extension sandbox.
- **Broad feature base.** Existing settings span playback, watch page, content
  filtering, comments, feed, subscriptions, downloads, local AI, subtitles,
  accessibility, and live chat.
- **Roadmap hygiene.** Recent research cycles have already identified many
  operational gaps with concrete next steps.

## Highest-Risk Gaps

### P0 Trust and Credential Exposure

There is an open secret-scanning alert for a Google API key in historical
`YTKit.user.js`. Even if the key is no longer active, the public alert remains a
release and trust liability until triaged, revoked or verified, and documented.
The secret value must never be copied into issues, docs, commits, logs, or
release notes.

Related P0 work exists for moving CRX signing-key custody out of the repo
worktree. Together, these two items should be treated as the immediate
trust-restoration lane.

### P1 Missing Security Intake and Scanning

The repo has no CodeQL/code-scanning results yet and lacks a published
`SECURITY.md`/private vulnerability reporting path. For a public extension that
handles browser permissions, host data, tokens, local loopback services, and
downloads, this is visible maturity debt.

### P1 Dependency Review Blocker

Open dependency PRs fail Dependency review while other checks pass. GitHub's
dependency review depends on dependency graph data for PR dependency changes.
The roadmap item to enable dependency graph before requiring dependency review
should be completed before more dependency-update PRs accumulate.

### P1 Companion Release Contract

Downloader UI and updater affordances exist, but the latest public release does
not ship the executable asset. This creates a user journey where the product can
detect and discuss a companion that users cannot install from the same release
channel.

### P2 Install-Time Permission Friction

The manifest grants optional enrichment and local hosts up front. This increases
install warnings and store-review burden. Runtime grants would better match
feature intent and user consent.

### P2 YouTube DOM Churn Exposure

The current capture fixture coverage is narrower than the product's injected
surface area. Open roadmap work correctly identifies Shorts, search, channel,
history, watch-later, embed, and notifications as missing fixture surfaces.

### P2 Documentation Drift

The repo has already identified retired options-page copy, release automation
doc drift, and repo-local working-notes drift. These are small individually but
harm review confidence because they make it harder to know which install and
settings path is current.

## Feature Opportunities

### 1. Permission and Trust Center

Goal: turn profile, data-flow, and optional host access into a first-class
settings experience.

What to build:

- A popup "Trust" tab that lists every external origin family from
  `data-flow.js`, grouped by store-safe, enrichment, local companion, and
  provider API.
- Runtime grant buttons for optional hosts once `optional_host_permissions` is
  implemented.
- Clear state labels: granted, not granted, unavailable in this profile,
  configured, missing key, local-only, sends video URL, sends transcript, stores
  locally, exported with scrubbed values.
- A one-click "store-safe mode" action that disables GitHub-full-only settings
  and revokes optional hosts where browser APIs allow it.
- Export preview that shows which settings are omitted or redacted by
  `policy-profile.js`.

Why it matters:

- Converts compliance work into user-facing value.
- Reduces install-time warning pressure.
- Makes API-provider and local-companion behavior understandable without reading
  docs.

Acceptance criteria:

- Data shown in the UI is generated from `data-flow.js` and
  `settings-schema.js`, not duplicated manually.
- Store-safe and GitHub-full builds render different capability states.
- Host-grant tests cover granted, denied, revoked, and unsupported browser
  paths.
- Exports cannot include raw key-like, cookie-like, auth-like, or secret-like
  values.

### 2. Companion Downloader Release and Health Hub

Goal: make Astra Downloader install, update, verification, and troubleshooting
match the quality of the extension release flow.

What to build:

- Signed installer/MSI and portable EXE assets in each GitHub release.
- Release manifest entries for downloader executable, installer, sidecar
  checksums, signature metadata, supported OS, and minimum extension version.
- Popup health states for installed, missing, outdated, unreachable,
  token-mismatch, yt-dlp outdated, ffmpeg missing, PO provider missing, and
  blocked-by-browser.
- A local endpoint that returns downloader version, yt-dlp version, ffmpeg
  status, token binding status, update channel, and supported capabilities.
- A docs page that maps each popup health state to one fix.

Why it matters:

- The downloader is a key differentiator, but only if users can install and
  trust it.
- Shipping the executable in the release manifest lets the popup update flow be
  verifiable instead of aspirational.

Acceptance criteria:

- `release-manifest.json` fails generation or CI if a release claims downloader
  support but lacks the required assets.
- The popup never offers an update action without a verifiable release source.
- Portable and installer artifacts have checksum and signature verification
  steps.
- Python tests cover update-channel parsing and local health JSON.

### 3. Subscription Intelligence Workspace

Goal: compete with subscription managers by using Astra Deck's existing
subscriptions, local AI, and data-flow model without becoming a cloud account
service.

What to build:

- Local subscription tags, channel groups, and watch queues.
- Per-group feed filters for duration, watched state, Shorts, premieres,
  livestreams, channel freshness, and hidden topics.
- Optional local summarization of a channel or group feed using browser
  summarizer or Ollama when available.
- Import/export of subscription organization with redacted provider settings.
- "Why hidden?" explanations for filtered videos.

Why it matters:

- PocketTube demonstrates strong demand for subscription organization.
- Astra Deck already has settings categories for subscriptions, feeds, local AI,
  content filters, and privacy profiles. This can deepen existing capabilities
  rather than add unrelated scope.

Acceptance criteria:

- All group/tag data is local-first and exportable.
- Filtering runs before expensive enrichment calls.
- Local summary features are unavailable unless a local or explicitly configured
  provider capability is available.
- Fixture coverage includes subscriptions, channel, search, home, and Shorts.

### 4. Content Rule Builder

Goal: offer a maintainable, transparent alternative to brittle keyword-blocking
extensions.

What to build:

- A rule builder for video title, channel name, channel ID, video ID, comment
  author, comment text, topic keywords, Shorts, livestreams, premieres, and
  duration.
- Rule scopes: home, subscriptions, watch suggestions, search, channel pages,
  comments, live chat, and Shorts.
- Actions: hide, collapse, blur thumbnail, mute autoplay preview, annotate,
  require click-through, or send to review queue.
- A dry-run/debug panel that shows which rules matched and which DOM selector
  produced the match.
- Import/export using the existing scrubbed settings export path.

Why it matters:

- BlockTube-style demand remains high because YouTube's native controls are
  limited.
- Astra Deck already has content-filter settings and selector diagnostics, so it
  can make local rules explainable and testable.

Acceptance criteria:

- Rule evaluation has bounded runtime on infinite-scroll pages.
- Regex rules have validation, timeout protection, and a disable-on-error path.
- Tests cover home, search, watch suggestions, comments, live chat, and Shorts.
- No remote call is required for local filtering.

### 5. Selector Health and Fixture Lab

Goal: convert YouTube DOM churn from reactive bug reports into measurable
surface health.

What to build:

- Expand MHTML fixtures to Shorts, search, channel, history, watch-later, embed,
  notifications, subscriptions, home, and signed-out pages.
- Add a fixture manifest that records capture date, locale, signed-in state,
  YouTube experiment indicators, and feature surfaces expected in each fixture.
- Add selector health scoring by feature group, not just global pass/fail.
- Add visual snapshots for overlay controls and popup states.
- Add "known broken selector" output in release artifacts.

Why it matters:

- Astra Deck injects controls into many unstable YouTube surfaces.
- A fixture lab gives maintainers a practical release signal when YouTube rolls
  out DOM changes.

Acceptance criteria:

- CI fails only on agreed P0/P1 selector regressions, while lower-priority
  warnings are reported without blocking.
- The fixture builder has deterministic redaction and storage-size limits.
- Each high-impact feature group declares at least one fixture surface.
- Release notes include selector-health caveats when degraded.

### 6. Accessibility Control Plane

Goal: make Astra Deck valuable for users who need YouTube to be more readable,
keyboard-friendly, and less visually disruptive.

What to build:

- Overlay target-size checks for injected buttons and close controls.
- Keyboard navigation maps for popup tabs and in-page overlays.
- Focus-visible styling checks for all custom controls.
- Motion reduction, contrast-safe theme variants, subtitle readability presets,
  and high-density/low-density toolbar modes.
- Live chat readability tools: message spacing, badge suppression, mention
  highlighting, and pinned-message controls.

Why it matters:

- The product already has accessibility/performance settings, subtitle settings,
  live-chat settings, and theme settings.
- Accessibility can be a differentiator if it is verified instead of only
  offered as toggles.

Acceptance criteria:

- Popup and overlay target sizes meet WCAG 2.2 target-size guidance or document
  a valid spacing exception.
- Automated contrast and focus tests cover popup and injected UI.
- Mobile/narrow viewport checks prevent text overlap and clipped buttons.
- Reduced-motion settings affect injected animations and transitions.

### 7. Research and Transcript Workspace

Goal: make Astra Deck useful for serious watching, learning, and note-taking
without requiring a cloud backend.

What to build:

- Local transcript panel with search, chapter alignment, timestamp bookmarks,
  and copy/export.
- Optional local summaries using browser summarizer or Ollama.
- Source-backed notes that store video ID, timestamp, title, channel, and
  transcript snippet.
- Export to Markdown/JSON with provider keys excluded.
- Playlist-level review mode for courses, lectures, and research queues.

Why it matters:

- The repo already has research/local AI settings and local capability probing.
- This creates value beyond visual YouTube tweaks while staying privacy-aware.

Acceptance criteria:

- Transcript storage is local and user-clearable.
- Provider-backed summary requests require explicit provider configuration or
  local capability availability.
- Export scrubber is shared with existing profile export logic.
- Tests cover missing captions, auto-generated captions, disabled transcript
  button, and long videos.

### 8. Release Readiness Dashboard

Goal: make maintainers confident that each release artifact matches the product
claim.

What to build:

- A generated release-readiness report that combines version sync, artifact
  inventory, SBOM, checksums, signature/custody status, CodeQL status,
  dependency graph status, secret-scanning status, fixture health, and
  downloader asset presence.
- A machine-readable JSON artifact consumed by release automation.
- A Markdown summary suitable for GitHub release notes.

Why it matters:

- Existing release automation is strong but spread across scripts and docs.
- A single readiness dashboard would catch missing downloader assets and stale
  docs before release publication.

Acceptance criteria:

- Release automation blocks or clearly marks any artifact mismatch.
- Secret-scanning status is reported without secret values.
- Downloader assets are optional only when the release manifest explicitly says
  companion delivery is omitted.
- The readiness report includes links to build artifacts and status checks.

## Prioritized Roadmap

### P0 - Immediate Trust Repairs

1. **Triage the open Google API key secret-scanning alert.**
   - Revoke or verify the key outside public repo content.
   - Close the alert with documented resolution metadata.
   - Add a regression scan that prevents key-shaped values in generated
     userscript and fixture outputs.
   - Never copy the secret value into docs, tests, commits, or logs.

2. **Move CRX signing-key custody out of the worktree.**
   - Define where the signing key lives, who can access it, and how releases
     retrieve it.
   - Add a local/public check that fails if signing material appears in tracked
     or untracked repo paths.
   - Document rotation and emergency revocation.

### P1 - Security and Release Foundations

3. **Add `SECURITY.md` and enable private vulnerability reporting.**
   - Publish supported versions, reporting channel, expected response window,
     and disclosure policy.
   - Link the policy from README/release docs.
   - Confirm GitHub private vulnerability reporting is enabled for the public
     repository.

4. **Enable CodeQL/code scanning.**
   - Add a CodeQL workflow for JavaScript/TypeScript and Python where
     applicable.
   - Keep it aligned with existing branch protection and check naming.
   - Document any expected limitations for generated bundle files.

5. **Enable dependency graph before requiring dependency review.**
   - Turn on dependency graph and Dependabot alerts.
   - Re-run dependency PRs #10 and #11 so Dependency review has data.
   - Keep the Dependency review requirement only after the check can pass on
     valid dependency PRs.

6. **Prove the Astra Downloader release-channel contract.**
   - Ship or explicitly omit companion artifacts in release manifest schema.
   - Include EXE/installer checksum/signature metadata.
   - Add tests that fail on missing claimed assets.
   - Align popup updater behavior with manifest truth.

7. **Migrate GitHub Actions to Node 24 action majors.**
   - Upgrade action majors only after validating Node 22 project runtime remains
     unchanged.
   - Keep lockfile and action-SHA policy aligned.

8. **Cross-browser Firefox MV3 smoke.**
   - Exercise popup, content-script injection, live chat injection, storage, CSP,
     and host permission behavior in Firefox.
   - Add a signed/unlisted XPI release path decision.

### P2 - Review Ergonomics, Resilience, and UX

9. **Convert optional enrichment hosts to runtime grants.**
   - Move provider hosts and local companion origins from install-time host
     grants to optional host permissions where browser support permits.
   - Add permission state to popup capability UI.
   - Keep store-safe builds narrow by default.

10. **Expand the MHTML capture-week fixture matrix.**
    - Add Shorts, search, channel, history, watch-later, embed, notifications,
      subscriptions, home, signed-out, and locale variants.
    - Record fixture metadata and expected feature groups.
    - Add selector-health scoring by surface.

11. **Ship signed downloader installer/MSI and install docs.**
    - Keep portable EXE for advanced users.
    - Add install/uninstall/update docs with troubleshooting states.
    - Link release assets from README and popup help.

12. **Replace retired options-page runtime copy.**
    - Remove stale "via options page" text from runtime UI.
    - Add a regression scan for retired surface names.

13. **Reconcile repo-local working notes and release automation docs.**
    - Make `docs/architecture.md`, README, release docs, and local notes agree
      on current popup-only settings and release behavior.
    - Remove references to old one-path release flows if profile split output is
      required.

14. **Add CODEOWNERS coverage.**
    - Cover extension core, downloader, release scripts, workflows, docs, and
      generated artifacts.
    - Use owners that have write access.
    - Keep the file below GitHub's CODEOWNERS size limit.

15. **WCAG 2.2 AA audit for in-page overlays.**
    - Audit target size, focus, contrast, keyboard behavior, text fit, and
      non-overlap.
    - Add fixture-backed tests for common overlay states.

### P3 - Product Differentiators

16. **Permission and Trust Center.**
    - Build after optional permissions and data-flow metadata are stable.

17. **Subscription Intelligence Workspace.**
    - Build after fixture coverage includes subscriptions, channel, home, search,
      and Shorts.

18. **Content Rule Builder.**
    - Build after selector-health and bounded rule evaluation infrastructure are
      in place.

19. **Research and Transcript Workspace.**
    - Build after capability probing and export scrubbing are fully covered by
      tests.

20. **Locale proofing queue.**
    - Use after UI copy is stable and before store listing expansion.

## Quick Wins

- Add a generated "settings inventory" artifact that reports category, risk, and
  profile counts from `settings-schema.js`.
- Add a report-only check that verifies every `api` and `local-companion` schema
  setting has a matching `data-flow.js` origin entry.
- Add a report-only check that verifies popup capability labels match
  `CAPABILITIES` keys.
- Add a `docs/downloader-troubleshooting.md` page keyed to popup health states.
- Add a static scan for retired UI-surface copy such as "options page".
- Add a release-manifest schema test that asserts companion asset fields are
  either complete or explicitly omitted.
- Add a public `SECURITY.md` with a minimal supported-versions table while the
  private vulnerability reporting setting is enabled.
- Add CODEOWNERS for `.github/workflows/`, `extension/core/`,
  `astra_downloader/`, `scripts/`, and release docs.

## Larger Bets

### Store-Safe Public Channel

Create a stricter public-store channel with minimal install-time permissions,
optional enrichment grants, no provider API hosts until enabled, and a polished
trust-center onboarding flow. Keep GitHub-full as the advanced channel.

### Local Companion Platform

Treat Astra Downloader as a local platform with versioned capabilities, signed
updates, health JSON, and typed APIs. This can later support transcript caching,
ffmpeg tasks, local media inspection, and offline exports without adding browser
extension risk.

### YouTube Surface Resilience Program

Make fixture capture, selector health, and visual QA part of release culture.
Every feature that touches YouTube DOM should declare its surfaces and fixture
expectations.

### Privacy-Aware Learning Mode

Bundle transcript search, notes, bookmarks, local summaries, playlist review,
and export into one workflow. This differentiates Astra Deck from both toggle
suites and single-purpose enrichment tools.

## Implementation Guardrails

- New settings must be added through `extension/core/settings-schema.js` with
  category, risk, profile, defaults, and capability requirements.
- New provider/local features must update `extension/core/data-flow.js` and the
  export scrubber path.
- Store-safe features cannot depend on GitHub-full-only hosts or provider keys.
- Runtime optional permissions should be checked before provider fetches or
  local companion calls.
- All downloader update UI must reflect release-manifest truth.
- Generated artifacts must not include secrets, local tokens, signing material,
  or provider keys.
- Every feature that touches YouTube DOM should declare fixture surfaces and
  selector-health expectations.
- Accessibility checks should include popup and injected UI states, not only
  static docs or isolated controls.
- Release docs should distinguish latest public release (`v4.46.0` at review
  time) from unreleased `main` changes.

## Suggested Acceptance Checklist for the Next Release

- Secret-scanning alert is resolved or documented as remediated without exposing
  secret values.
- Signing material is absent from tracked and untracked repo worktree paths.
- `SECURITY.md` exists and private vulnerability reporting is enabled.
- CodeQL/code scanning produces results on PRs or the default branch.
- Dependency graph and Dependabot alerts are enabled; dependency review no
  longer blocks valid dependency PRs for lack of data.
- Release manifest truthfully reports extension, userscript, SBOM, checksum, and
  downloader assets.
- Companion downloader install/update docs match actual release assets.
- Optional host permission plan is implemented or tracked as a release blocker
  for store-safe expansion.
- MHTML fixture matrix includes at least watch, live chat, Shorts, search,
  channel, home/subscriptions, and embed.
- Popup and injected controls pass target-size, contrast, focus, and text-fit
  checks for representative desktop and narrow viewports.
- README, architecture docs, roadmap, and release docs agree on current settings
  surface and distribution paths.

## Open Questions

- Should the public Chrome Web Store channel omit all provider API hosts until
  the user enables a feature, or keep a small allowlist for enrichment providers
  that are central to the product?
- Should Astra Downloader be distributed only as a portable EXE, or should the
  release channel include both portable and signed installer/MSI assets?
- Should Firefox distribution target public AMO listing, unlisted self
  distribution, or both?
- Should local transcript and note features live entirely in extension storage,
  or should the downloader companion own larger local datasets?
- Which feature groups are important enough to fail release on selector-health
  regression, and which should produce warning-only release notes?

## Recommended Next Action

Start with the trust and release-foundation lane:

1. Triage the secret-scanning alert without reproducing the secret.
2. Move CRX signing-key custody out of the worktree.
3. Add `SECURITY.md` and enable private vulnerability reporting.
4. Enable CodeQL and dependency graph.
5. Prove the downloader release-channel contract.

After those are complete, the best user-visible feature investment is the
Permission and Trust Center, because it reuses Astra Deck's existing profile,
capability, and data-flow architecture while directly improving installation
trust, store review posture, and advanced-user clarity.
