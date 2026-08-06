# Roadmap Blocked Items

Items moved here from ROADMAP.md because they cannot be completed programmatically and require manual/external actions.

## P0 — Delivery

- [ ] P0 — Tag and publish the v4.51.1 release
  Why: `CHANGELOG.md` declares `[4.51.1] - 2026-08-02` and all version sources agree, but the newest git tag and GitHub release is v4.50.7 (2026-07-28). Two versions of shipped work — durable scheduled subscriptions, the Firefox native-messaging bootstrap fix, resume-playback persistence, the download filename cap and ~33 further fixes — are undelivered on a hand-install channel with no auto-update.
  Evidence: `git tag --sort=-v:refname` tops out at v4.50.7; `gh release list` newest is v4.50.7; `package.json` / `extension/manifest.json` / `docs/architecture.md` all state 4.51.1. The v4.50.7 release carries the ZIP/XPI/userscript/SBOM/companion assets but no CRX artifacts.
  Touches: `npm run release:prepare`, `scripts/generate-release-readiness.js`, `scripts/generate-release-manifest.js`, `scripts/stage-companion-release.js`, git tag, GitHub Release assets.
  Acceptance: a `v4.51.1` tag exists on the release commit and a GitHub Release carries the full artifact set per the repo release policy (store-safe + GitHub-full Chrome ZIP/CRX and Firefox ZIP/XPI, userscript, SBOM, `release-manifest.json`, `SHA256SUMS`); `npm run release:verify-digests -- --tag v4.51.1` passes.
  Complexity: S
  Blocker: The external maintainer CRX key is absent (`%LOCALAPPDATA%\Astra-Deck\keys\ytkit.pem` does not exist and `ASTRA_CRX_KEY_PATH` is unset). This run's AGENTS contract also forbids signing software, so publishing the required CRX artifact set cannot be completed without a permitted signing-key decision and external key material.

- [ ] P3 — aria2c external-downloader option
  Why: parallel external downloading could improve throughput for some large media, but the requested integration contradicts the repository's active security invariant.
  Evidence: `astra_downloader/test_astra_downloader.py` (`Aria2cExternalDownloaderBanTests`); `CHANGELOG.md` (CVE-2026-50574 external-downloader ban).
  Touches: `astra_downloader/download.py`, provisioning, `config.py`, `health.py`.
  Acceptance: reconsider only after an upstream design demonstrably removes the manifest-download arbitrary-code-execution condition and the repository can replace its source-level ban with a verified safe contract.
  Complexity: L
  Blocker: As of 2026-07-29, the companion deliberately rejects all aria2c and `--external-downloader` integration because CVE-2026-50574 allowed arbitrary code execution through manifest downloads. Implementing this roadmap item would remove an explicit, test-pinned security boundary.

- [ ] P1 — Native-messaging download-command transport as a Chrome-LNA fallback
  Why: Chrome 142 (Oct 2025) enforces Local Network Access, which can gate/block the extension's `127.0.0.1` fetch to the companion; the token path already rides native messaging but the *download command* path is HTTP-only, so downloads can fail while auth still works. Native messaging is the LNA-immune bridge (browserpass/KeePassXC/1Password pattern).
  Evidence: RESEARCH.md 2026-07-27 §Security/Reliability + Open Questions; `astra_downloader/astra_downloader.py` (`handle_native_bootstrap_request` serves only ping/get-token); https://developer.chrome.com/blog/local-network-access
  Touches: `astra_downloader/astra_downloader.py` (native host message loop → accept download/status/queue verbs), extension `MediaDLManager` (detect localhost-fetch blocked → fall back to native transport), native-host manifest.
  Acceptance: with the extension's `127.0.0.1` fetch blocked/denied by LNA, a download can still be initiated and its status polled over the native-messaging channel; when direct fetch works, behavior is unchanged.
  Complexity: L
  Blocker: Requires a live Chrome 142+ browser to reproduce LNA blocking and verify the native-transport fallback end-to-end — same live-browser dependency as the existing "Validate Chrome LNA exemption" item. Implement + verify together once a test browser is available.

## P3 — Live-browser verification (2026-07-21)

- [ ] P3 — Live-browser behavioral audit of the extension feature modules
  Why: the 2026-07-20 audit deeply traced the companion and fixed a status-tone inconsistency, but the extension feature modules' *runtime* logic (e.g. `extension/features/download-ui/index.js`, video-hider, subscription-groups) was only spot-checked; the static a11y/contrast/i18n/lint gates and unit tests pass, but behavioral bugs on live YouTube DOM (empty/error/offline states, feature auto-disable-on-miss) are not covered by fixtures.
  Where: `extension/features/**/index.js`, live YouTube watch/subscriptions/live-chat surfaces.
  Blocker: Requires driving a real browser against live YouTube — cannot be performed in the headless/no-live-DOM environment; belongs with the other browser-gated verification items.

## P2 — External-binary integration + live verification (2026-07-21)

- [ ] P2 — Auto-provision the bgutil PO-token provider (single-binary) the way Deno is provisioned
  Why: Deno is already auto-provisioned but the PO-token provider is left to the user, so token-gated downloads and bot-check bypass are not available out of the box.
  Evidence: https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs; `astra_downloader/astra_downloader.py` (Deno provisioning pattern), `astra_downloader/health.py` `PoTokenProviderProbe` (probes `/ping` on port 4416 for a `version` field).
  Where: `astra_downloader/astra_downloader.py` (provisioning + SetupWorker), `astra_downloader/health.py`, config/GUI readiness, checksum verification.
  Blocker: Requires the external project's exact Windows-x64 release-asset name and checksum-manifest contract (needs a live GitHub-releases fetch), plus a persistent sidecar-process lifecycle (launch on setup, stop on exit, port/health management) that cannot be verified end-to-end without downloading and running the real binary in this environment. Shipping a binary-downloader against guessed asset names/launch flags would be unverifiable. Lower urgency now that the 2026-07-21 token-exempt client fallback (`youtube:player_client=tv,android_vr,web`) already keeps downloads working when no provider is running — this item is an optimization (restore the web+PO-token path), not a fix for total failure.

## P3 — Browser-Gated Verification (2026-07-15 audit)

- [ ] P3 — Live-chat English-only structural fallbacks need browser-gated verification
  Why: the popout-hide selector matches aria-label="Popout chat" and one tooltip test matches an English sentence; both degrade silently on non-English UI.
  Where: `extension/features/live-chat/index.js` (~20, ~146)
  Acceptance: replacement selectors are structural (attribute/renderer-based, no English text), verified against the live YouTube live-chat DOM in at least one non-English UI locale.
  Complexity: S
  Blocker: needs live-DOM verification of stable structural hooks on an actual YouTube live stream (the live-chat iframe cannot be reproduced from fixtures); changing the selectors blind risks silently breaking popout hiding for all locales.

## P2 — Documentation Publication Constraint (2026-07-14)

- [ ] P2 — Force DVR on live streams
  Why: Streams with DVR disabled cannot rewind; a MAIN-world player-response interceptor can enable DVR when the expected response shape is present.
  Evidence: DVR-chan 4.1 source; `extension/ytkit-main.js`; schema and i18n coverage gates.
  Where: `extension/ytkit-main.js`, settings schema/defaults/locales, generated i18n coverage report, player-response fixtures.
  Acceptance: On a DVR-disabled live fixture, the seekbar becomes scrubable; the feature is off by default and reports degradation when the player-response shape drifts.
  Complexity: M
  Blocker: A new off-by-default setting requires locale catalog changes, and the clean-clone i18n gate requires the tracked generated `docs/i18n-coverage.md` to change with them. This run forbids staging Markdown other than README/CHANGELOG, so the feature cannot be committed with a passing clean-clone check under the current file-hygiene constraint.

## P0 — Legal / Distribution Decision (2026-07-14)

- [ ] P0 — Select and record the PyQt6/Qt companion redistribution route
  Why: the artifact-linked license inventory and readiness gate now identify the exact embedded/runtime components, but binary release remains blocked until the maintainer chooses GPL-compatible distribution with corresponding source or records a valid Riverbank commercial entitlement and completes the Qt notice/source obligations.
  Where: `astra_downloader/license-policy.json`, `scripts/companion-license-inventory.js`, release SBOM/readiness output.
  Acceptance: `pyqt6` and `pyqt6-qt6` policy entries contain the selected license expressions, non-secret approval evidence, exact notice/source routes, and approved decisions; the companion license readiness check passes without suppressions after the exact helper versions/digests are also resolved.
  Complexity: S
  Blocker: Requires maintainer legal/commercial judgment and, for the commercial route, entitlement evidence unavailable to an autonomous coding agent.

## P2/P3 — Product Decisions (2026-07-12 audit)

- [ ] P2 — Bound companion playlist downloads
  Why: `is_playlist_url` adds `--yes-playlist` with no `--playlist-end`/`--max-downloads`, so one accepted `/download` can spawn an unbounded multi-hundred-item job that holds a MAX_CONCURRENT slot and fills the confined output root; the stall watchdog never fires because an active playlist keeps producing output. Rate limiting caps request count, not per-request work.
  Where: `astra_downloader/astra_downloader.py` (`is_playlist_url` ~2764; invocation ~3266/3317).
  Complexity: M
  Blocker: Product decision — choose a sane default cap (for example `MaxPlaylistItems`, with 0 meaning unlimited). Silently capping could surprise users who intentionally download full playlists, so the default and GUI/config surface require maintainer judgment.

- [ ] P3 — Reconsider `.google.com` breadth in the cookie allowlist
  Why: `ALLOWED_COOKIE_DOMAINS` includes the `.google.com` wildcard, which is genuinely required for authenticated YouTube downloads (SAPISID/SID live there) but also matches non-YouTube Google cookies. yt-dlp only sends cookies whose domain matches the youtube.com request, so the incremental exfil risk is low — but a tighter scheme (only forward the specific auth cookie names) would shrink the credential surface.
  Where: `astra_downloader/astra_downloader.py:1991` (`ALLOWED_COOKIE_DOMAINS`).
  Complexity: M
  Blocker: Product decision — decide whether to allowlist the google.com set by cookie name rather than domain without breaking authenticated or members-only downloads.

- [ ] P3 — Native-host token handshake assumes a single message
  Why: `NATIVE_MSG_GET_TOKEN` responds on the first `port.onMessage` and disconnects; a native host that sends a hello/handshake frame before the token reply would consume the single response slot and the real token frame would never be read.
  Where: `extension/background.js` (~947-961).
  Complexity: S
  Blocker: Protocol decision — confirm the native host never sends a pre-token frame. If it can, the client must ignore non-terminal frames until a token/terminal-error arrives or the timeout fires.

- [ ] P3 — SponsorBlock segment submission and voting
  Why: Astra reads the SponsorBlock commons (`skipSegments` GET only) with no path to contribute, and reviewers of competing tools repeatedly ask for a local correction path when a segment is wrong. DeArrow voting and casual mode are already shipped, so the UI precedent exists.
  Evidence: `extension/features/sponsorblock/index.js:242-306` (read-only); `extension/ytkit.js` `deArrowVoting` / `casualMode` precedent; https://github.com/ajayyy/SponsorBlock/issues.
  Touches: `extension/features/sponsorblock/index.js`, `extension/core/credential-vault.js` or a new durable domain for the private user ID, `extension/core/data-flow.js`, settings schema and locales.
  Acceptance: off by default and GitHub-full only; a locally generated private user ID is stored in a backup-excluded, scrub-covered domain; voting works before submission is enabled; every write is rate-budgeted and surfaces failures through `external-api-health`.
  Complexity: L
  Blocker: Requires maintainer product/liability judgment on whether Astra should carry submission at all, versus voting only or neither. The choice changes the identity, durable-storage, and outbound-write design and cannot be inferred from the repository.

- [ ] P2 — DeArrow Voting posts to a nonexistent API route with the wrong payload shape — every vote fails
  Category: correctness
  Where: extension/ytkit.js:37861-37877 (deArrowVoting._vote)
  Problem: Votes go to `POST https://sponsor.ajay.app/api/branding/vote/${type}` with body {UUID, userID}. SponsorBlockServer exposes no /api/branding/vote/<n> route; branding votes are `POST /api/branding` with {videoID, userID, title|thumbnail, downvote}; the {UUID, userID, type} shape belongs to the segment endpoint /api/voteOnSponsorTime. Every vote 404s, so both vote buttons always show "DeArrow vote failed." The v4.51.0 audit fixed the attribute wiring that makes these buttons appear — nothing verifies the vote round-trip.
  Evidence: The only other DeArrow API use is GET /api/branding?videoID= (features/dearrow/index.js:167, ytkit.js:31172); no test covers the vote endpoint (grep branding/vote tests/ → nothing).
  Fix: POST /api/branding with videoID + the existing title/thumbnail evidence + `downvote: type === 0` per the DeArrow API docs (or remove the vote buttons if submission is out of scope — align with the Roadmap_Blocked SponsorBlock-submission product decision). Add a fetch-fake test pinning URL + payload shape.
  Acceptance: Vote requests hit /api/branding with the documented shape (test-pinned); a live vote returns 200 when verified against the real API.
  Confidence: Likely (endpoint knowledge verified against SponsorBlockServer docs; not network-verified from here)
  Effort: S
  Blocker: Fixing this means sending an outbound WRITE to DeArrow's public crowdsourced
  database (sponsor.ajay.app), and the correct payload cannot be confirmed without
  actually submitting to that production commons — a wrong shape would publish garbage
  titles into a community dataset. The repository only ever calls `GET /api/branding`,
  so there is no in-repo evidence of the write contract. It also needs the same
  maintainer product/liability judgment as "P3 — SponsorBlock segment submission and
  voting" above: whether Astra should carry outbound contributions at all.
  Unblock by: (a) deciding whether voting stays, then (b) confirming the branding-vote
  contract against DeArrow's API docs and a test submission on a throwaway userID —
  the expected shape is `POST /api/branding` with
  `{videoID, userID, service, title: {title, original}, downvote: type === 0}`, NOT the
  current `/api/branding/vote/<n>` with `{UUID, userID}` (that UUID shape belongs to the
  segment endpoint `/api/voteOnSponsorTime`). Until then every vote 404s and both
  buttons always show "DeArrow vote failed", so the feature is inert, not merely
  degraded — dropping the buttons is an equally acceptable resolution.

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

- [ ] P2 — Establish one canonical implementation per extracted extension feature
  Why: The extension-only download UI is canonical as of commit `0ee9e49`, but every remaining extracted module is shared with the generated userscript; deleting those fallbacks before the stale userscript bundle is repaired would break a shipped vehicle.
  Evidence: `extension/manifest.json`, `extension/ytkit.js`, `extension/features/*`, `scripts/sync-userscript.js`, `scripts/check-userscript-drift.js`.
  Touches: feature registry/composition, extracted modules, monolith fallback blocks, userscript bundle generation, behavioral boundary tests.
  Acceptance: each migrated shared feature has one source implementation consumed by extension and userscript; explicit exclusions remain tested; duplicate fallback code is deleted; manifest/generated-bundle drift and lifecycle parity fail CI; migration proceeds in reviewable feature-sized batches.
  Complexity: XL
  Blocker: All remaining extracted modules are bundled into the userscript. Resolve the stale userscript settings/import contract below and verify the regenerated bundle in a Tampermonkey browser session before removing any remaining shared fallback.

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

## P1 — Documentation Publication Constraint (2026-07-14)

- [ ] P2 — Replay chat-density highlight chart
  Why: Chat-activity spikes locate VOD highlights; the feature must remain optional because it observes and aggregates replay-chat activity.
  Evidence: VOD Highlight Analyzer (SkAnon), Live Replay Comment Collector (yuyuyzl).
  Touches: new `extension/features/` module, chat replay frame observation, canvas sparkline over progress bar, settings schema/locales.
  Acceptance: On VODs with chat replay, an opt-in density sparkline renders above the progress bar; clicking a spike seeks there; sampling is budgeted and cancelled on navigation.
  Complexity: L
  Blocker: A truthful opt-in requires a new schema entry and localized setting copy. The clean-clone `npm run check` contract requires the tracked `docs/i18n-coverage.md` report to be regenerated with those locale changes, but this run explicitly forbids staging Markdown other than `README.md` and `CHANGELOG.md`.

- [ ] P2 — Opt-in settings/blocklist sync (`storage.sync`)
  Why: Browser-account sync must be a distinct default-off consent decision; the existing `syncSafePrefs` field only governs safe-profile export filtering and defaults on.
  Evidence: BlockTube issue #59; `extension/ytkit.js:5528-5660`; no `storage.sync` runtime call sites.
  Touches: storage layer, policy-profile scrub, popup settings/import recovery, settings schema/locales.
  Acceptance: A default-off toggle syncs schema-validated, secret-scrubbed preferences and blocklists within quota, resolves newest-write-wins conflicts, and offers local Undo.
  Complexity: L
  Blocker: Reusing `syncSafePrefs` would silently change an existing export-policy setting; a truthful consent setting requires new localized copy and a committed `docs/i18n-coverage.md` update forbidden by this run.

- [ ] P2 — Logarithmic volume curve
  Why: A low-volume curve changes core playback semantics and must remain independently optional.
  Evidence: Youtube Music fix volume ratio (Nemo64); Volume Curve Designer.
  Touches: shared player/audio path, settings schema/locales, rememberVolume integration.
  Acceptance: A toggle remaps native slider position to logarithmic gain without double-scaling volumeBoost or persisted volume.
  Complexity: S
  Blocker: No existing setting truthfully represents logarithmic remapping; adding the required opt-in and localized copy requires a committed `docs/i18n-coverage.md` update forbidden by this run.

- [ ] P1 — Generate volatile project facts and fail documentation drift
  Why: docs inspected on 2026-07-14 disagree with source on locale count, schema size, module count, extension surfaces, Firefox floor, themes, and bounded YouTube Music/embed behavior, which makes release and contributor guidance unreliable.
  Evidence: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/architecture.md`; `extension/core/settings-schema.js`; manifests; `scripts/check-versions.js`.
  Touches: source-of-truth scripts/tests, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/architecture.md`, package check pipeline.
  Acceptance: stale claims are corrected; generated/validated facts cover version, browser floors, locales, schema entries, peeled modules, shipped surfaces, profiles, themes, and compatibility modes; changing a source fact without its rendered documentation fails `npm run check`.
  Complexity: M
  Blocker: This run explicitly forbids staging Markdown other than `README.md` and `CHANGELOG.md`, but completion requires committed corrections in tracked `CONTRIBUTING.md` and `docs/architecture.md`; a code-only generator would fail in a clean clone while those verified stale claims remain.

- [ ] P1 — Make build profiles immutable capability ceilings with a verified permission matrix
  Why: staged artifacts are not stamped store-safe/GitHub-full and runtime settings can resolve a store-safe install to GitHub-full UI behavior; store-safe intentionally keeps the local companion, so its permissions must follow the documented capability matrix rather than an assumed blanket reduction.
  Evidence: `build-extension.js:491-505`, `extension/core/policy-profile.js`, `extension/manifest.json`, `docs/store-permission-rationale.md:95-118`, `README.md:57,178`; Chrome permission-declaration guidance.
  Touches: build-profile staging, schema/profile capability catalogue, manifest permission matrix, runtime flags/policy profile, onboarding/import gates, Chrome/Firefox build tests.
  Acceptance: each artifact contains a tested immutable profile ceiling; imports and UI settings cannot exceed it; store-safe retains authenticated local-companion behavior but cannot activate any `profile: github-full` feature or host such as Cobalt/AI/Ollama; every required/optional API and host permission is generated from and tested against the documented per-profile rationale; the existing blocked side-panel permission-request verification remains separate.
  Complexity: M
  Blocker: The required store-safe companion matrix contradicts the tracked `docs/store-permission-rationale.md`, which currently assigns all six companion loopback hosts to GitHub-full and says store-safe excludes them. Completing the acceptance requires committing that Markdown correction, but this run explicitly forbids staging Markdown other than `README.md` and `CHANGELOG.md`.

- [ ] P3 — Filmot deleted-video title restore (GitHub-full)
  Why: Restoring titles of deleted/private playlist entries is uniquely valuable for old playlists; external API so GitHub-full only.
  Evidence: Filmot Title Restorer (Jopik1, 4.5k).
  Touches: playlist rendering path, data-flow registration, external-api-health.
  Acceptance: On playlists, [Deleted video] rows optionally resolve via Filmot with cache + rate budget; store-safe artifacts strip the host grant automatically.
  Complexity: M
  Blocker: Repository research names the userscript but contains no verified Filmot host, request/response schema, public API terms, or fallback contract. This development pass forbids fresh research, so implementing an endpoint would be speculative.
