# Roadmap Blocked Items

Items moved here from ROADMAP.md because they cannot be completed programmatically and require manual/external actions.

## P1 — Trust / Reliability / Distribution

- [ ] P1 — Chrome Web Store submission (store-safe profile)
  Why: The store-safe build profile exists and strips AI/Cobalt/loopback permissions, but has never been submitted. Every major competitor (Enhancer, ImprovedTube, Tweaks, Unhook) is CWS-published. Side-loading requires developer mode, which most users won't enable.
  Evidence: CWS review process docs; `docs/cws-submission-checklist.md` and `docs/store-permission-rationale.md` already prepared; Enhancer for YouTube and ImprovedTube are CWS precedent for 100-200+ feature YouTube extensions.
  Touches: Chrome Web Store developer dashboard, `docs/cws-submission-checklist.md`, store listing assets (screenshots, description)
  Acceptance: Store-safe profile submitted and either approved or rejected with actionable feedback.
  Complexity: M
  Blocker: Requires manual Chrome Web Store developer dashboard interaction (screenshots, listing copy, human review submission). Cannot be automated.

- [ ] P1 — Firefox AMO submission (store-safe profile)
  Why: Firefox XPI distribution currently requires manual install. AMO listing provides auto-updates, trust signal, and discoverability. Firefox 142+ manifest patch is already automated.
  Evidence: AMO updated policies (August 2025); Enhancer for YouTube lost Firefox AMO presence, creating an opportunity gap.
  Touches: AMO developer dashboard, `scripts/manifest-patch.js` output verification, store listing assets
  Acceptance: Store-safe XPI submitted to AMO and either approved or rejected with actionable feedback.
  Complexity: M
  Blocker: Requires manual AMO developer dashboard interaction (screenshots, listing copy, human review submission). Cannot be automated.

- [ ] P1 — Companion release EXE + SHA256 sidecar + clean-machine verification
  Why: The updater/setup flow requires both `AstraDownloader.exe` and `AstraDownloader.exe.sha256` on the latest GitHub release. The current latest release ships extension/userscript artifacts only, so users cannot complete the one-click companion setup path.
  Evidence: README "Astra Downloader Companion Setup" section; `astra_downloader/build.py` exists; `scripts/stage-companion-release.js` exists; `gh release view --json assets` on the latest release lists no companion assets.
  Touches: `astra_downloader/build.py`, GitHub Release assets, `scripts/stage-companion-release.js`
  Acceptance: `AstraDownloader.exe` and `AstraDownloader.exe.sha256` attached to a GitHub Release; the EXE runs on a clean Windows 10 machine without Python installed; `/health` returns valid JSON.
  Complexity: M
  Blocker: Requires maintainer GitHub authentication to upload the sidecar (`gh auth status` reports the SysAdminDoc token is invalid in this environment) plus manual clean Windows verification that the EXE runs standalone.

## P2 — Documentation

- [ ] P2 — Competitor migration documentation
  Why: Iridium (1,300 GitHub stars) was archived Jan 2026 with orphaned users seeking alternatives. Enhancer for YouTube abandoned Firefox (510K users) in Aug 2025. Landing pages with settings-import guides would capture these users at zero feature development cost.
  Touches: `docs/migration-from-iridium.md`, `docs/migration-from-enhancer.md`, README.md
  Acceptance: Each migration doc maps the competitor's top features to Astra Deck equivalents with install instructions.
  Complexity: S
  Blocker: Requires creating new markdown documentation files. Maintainer-authored content for migration guides.

- [ ] P2 — Supply chain transparency documentation
  Why: Post-ShadyPanda (4.3M users compromised Dec 2025), Astra Deck's open-source audit trail and SBOM/attestation pipeline are differentiators not documented for end users.
  Touches: `docs/supply-chain-transparency.md`, README.md
  Acceptance: Page documents audit trail, SBOM, attestation, credential scrub, profile-split permissions, and release integrity verification.
  Complexity: S
  Blocker: Requires creating new markdown documentation files. Maintainer-authored trust documentation.

## P3 — Blocked on External API Stability

- [ ] P3 — Chrome Writer/Rewriter API for comment drafting
  Why: Chrome's Writer and Rewriter APIs offer on-device text generation and refinement. When stable, they could power comment drafting assistance without BYO keys.
  Touches: `extension/ytkit.js` (comment composer enhancement), `core/capability-probe.js`, settings schema
  Acceptance: When Writer API is available, a "Draft" button appears in YouTube's comment composer; responses generated on-device; feature off by default.
  Complexity: M
  Blocker: Chrome Writer/Rewriter APIs are in Developer Trial as of June 2026, not yet stable. Implementing against an unstable API surface creates maintenance burden.

## P1 — Browser-Gated

- [ ] P1 — Validate Chrome Local Network Access exemption for companion communication
  Why: Chrome 142+ gates content-script-to-localhost fetch behind a user permission prompt. Chrome 147+ extends this to WebSocket. The extension communicates with the companion via `fetch()` to `http://127.0.0.1:9751` (and 5 fallback ports). The manifest has explicit `host_permissions` for these origins, which should exempt the extension from the prompt — but this has never been verified on Chrome 147+. If the exemption doesn't hold, companion communication silently breaks for users on Chrome 147+.
  Evidence: Chrome What's New in Extensions (Local Network Access, Chrome 142/146/147); manifest.json `host_permissions` includes `http://127.0.0.1:9751/*` through `9851/*`.
  Touches: Manual testing on Chrome 147+. If exemption fails: `extension/manifest.json` (add `optional_host_permissions`), `extension/core/optional-host-permissions.js`, `extension/ytkit.js` (MediaDLManager.check flow).
  Acceptance: Companion health check and download flow work on Chrome 147+ without user-visible permission prompt. If prompt is needed, document the flow and surface a diagnostic message.
  Complexity: S (if exempted) / M (if not)
  Blocker: Requires loading the extension in Chrome 147+ and verifying companion communication with a running Astra Downloader instance. Cannot be tested without a live Chrome 147+ browser.

## P2 — Browser-Gated

- [ ] P2 — Selector fixture refresh for Delhi Modern player
  Why: YouTube's "Delhi Modern" player rollout (Oct 2025–Jan 2026) changed player button DOM to translucent overlay buttons. The selector packs have canaries for `ytp-delhi-modern` but the MHTML fixture may predate the completed rollout.
  Touches: `scripts/capture-watch-mhtml.js`, `scripts/build-selector-fixtures.js`, `tests/selector-regression.test.js`, `core/selector-packs/playerChrome.js`
  Acceptance: Selector fixture regenerated from a live 2026-era YouTube watch page. All critical playerChrome/playerSettings selectors match.
  Complexity: S
  Blocker: Requires a live Chrome browser to capture MHTML from YouTube. Browser binaries not available in this environment.

## P2 — Observability / Developer Experience

- [ ] P2 — Visual regression testing for popup
  Why: The popup is the primary user-facing control surface. CSS changes, i18n string length variations, and Chrome version differences can cause visual regressions that unit tests cannot catch.
  Evidence: No visual regression tests in the codebase; popup has been through multiple redesigns (v3.11, v3.19, v4.x).
  Touches: New `tests/visual/` directory, Puppeteer screenshot comparison, local visual test command
  Acceptance: Local visual tests capture popup screenshots in Chrome and Firefox; a baseline is committed; regressions fail the local check with a diff image.
  Complexity: M
  Blocker: Requires headless Chrome/Firefox with Puppeteer installed to capture baseline screenshots. Browser binaries not available in this environment.

## P2 — Browser-Gated (CSS Adoption)

- [ ] P2 — Customizable `<select>` adoption for settings panel
  Why: Chrome 135+ supports `appearance: base-select` for styled native dropdowns.
  Touches: `extension/ytkit.js`, `extension/popup.css`, `extension/early.css`
  Acceptance: Settings panel `<select>` elements render with dark-theme styling on Chrome 135+. Unsupported browsers fall back to native `<select>`.
  Complexity: S
  Blocker: Requires live browser testing on Chrome 135+ to verify progressive enhancement and cross-browser fallback. Cannot verify without a running browser.

- [ ] P2 — `@starting-style` adoption for panel entry animations
  Why: `@starting-style` (Baseline 2025) would replace JS rAF timing hacks for toast/panel animations with pure CSS.
  Touches: `extension/ytkit.js`, `extension/popup.css`, `extension/core/toast-dom.js`
  Acceptance: Panel/toast animations use `@starting-style` with `transition-behavior: allow-discrete`.
  Complexity: S
  Blocker: Toast CSS is duplicated in both the monolith and toast-dom.js (userscript parity). Requires live browser verification that the CSS fallback degrades gracefully on older browsers. Cannot verify without a running browser.

- [ ] P2 — Exclusive Accordion for settings categories
  Why: `<details name="settings">` would create accordion behavior for settings categories.
  Touches: `extension/ytkit.js` (settings panel DOM construction)
  Acceptance: Settings categories use `<details name="ytkit-settings">`.
  Complexity: S
  Blocker: The settings panel uses a sidebar-tab navigation model, not vertical collapsible sections. Adopting `<details name>` would require restructuring the panel's DOM architecture. Requires live browser verification of the new layout.

## P1 — Security Product Decisions (2026-07-08 audit)

- [ ] P1 — Companion `/health` echoes the auth token to any co-installed
  extension by default
  Why: `LegacyHealthTokenEcho` defaults on and `is_extension_origin` accepts any
  `chrome-extension://` / `moz-extension://` origin (no ID allowlist), and CORS
  reflects that origin — so any other installed extension can spoof the
  `X-MDL-Client: MediaDL` header, read the reflected `token`, and drive
  `/download`. Default the echo off once the native-messaging bootstrap is the
  confirmed primary path for existing users, or gate on a configured extension-ID
  allowlist. (Impact bounded: YouTube-only URL gate, output-dir confinement.)
  Where: astra_downloader/astra_downloader.py (~3661-3810)
  Blocker: Product decision — changing the default breaks any non-native-messaging
  client that relies on the HTTP token echo. Needs confirmation that the
  native-messaging bootstrap is the primary path before defaulting off.

- [ ] P3 — Unauthenticated `/health` leaks recent log lines (local paths / errors)
  Why: `recentErrors` (last 20 log messages, absolute paths and error text) is
  in the fully-unauthenticated `/health` payload. Gate behind auth or redact.
  Where: astra_downloader/astra_downloader.py (~3791)
  Blocker: Product decision — gating /health output behind auth changes the API
  surface used by extension diagnostics panels. Needs design decision on what
  to expose vs gate.

## P2 — Userscript Structural Drift (Browser-Gated)

- [ ] P2 — Userscript bundle is stale; next sync will break Import
  Why: `YTKit.user.js` still bundles the pre-4.46.26 settings-panel and
  pre-4.46.27 subscription-groups modules, so the shipped userscript lacks the
  Takeout import, import summaries/undo, and group import counters it claims by
  version. The module sources now call `settingsManager.importAllSettingsDetailed`
  and `importYouTubeTakeoutWatchHistory`, which the userscript monolith's
  `settingsManager` does not implement — so `node sync-userscript.js` will ship
  an Import button that throws `TypeError` on click. Port both methods (plus
  their dozen helper functions) into the monolith `settingsManager` and mirror the
  `deno-runtime-unsupported` recovery copy before regenerating the bundle.
  Where: YTKit.user.js, extension/features/settings-panel/index.js, sync-userscript.js
  Blocker: Porting requires adapting ~200 lines of extension-only storage API
  calls (StorageManager.setSync, STORAGE_KEYS, IMPORT_LIMITS, estimateSerializedBytes,
  etc.) to the userscript's GM_* storage shim, and verifying the result in a
  Tampermonkey browser session. Cannot be verified without a running browser.

- [ ] P2 — Side-panel toggles bypass optional-host permission + profile gating
  Why: side-panel `writeSetting` does not call `requestOptionalHostsForSetting`,
  so enabling an API-backed feature (SponsorBlock/DeArrow) reports success while
  the feature silently no-ops without host access. Mirror the popup gating.
  Where: extension/sidepanel.js (~437-453)
  Blocker: Requires browser verification that `chrome.permissions.request()` works
  from the side panel's user-gesture context. Cannot verify without a running browser.

- [ ] P1 — MAIN-world audio graph reconnect needs browser verification
  Why: The WeakMap-cached source node fix (shipped in v4.46.29) is architecturally
  correct but needs verification that YouTube's persistent <video> element + SPA
  navigation actually triggers the reconnect path and that audio passthrough
  works correctly with the gain-bypass idle mode. Verify with any audio feature
  (volume boost, mono-to-stereo, normalization) across two video navigations.
  Where: extension/ytkit-main.js (~395-512)
  Blocker: Requires loading the extension in Chrome/Edge with audio features
  enabled and navigating between videos to verify audio continuity.
