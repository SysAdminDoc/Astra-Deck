# Roadmap Blocked Items

Items moved here from ROADMAP.md because they cannot be completed programmatically and require manual/external actions.

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

- [ ] P2 — Dual-language subtitles
  Why: A second independently selected caption track is valuable for language learners but must be explicitly enabled and configured.
  Evidence: YtDLS (CY Fung), Youtube dual subtitle (0xjax), vanadis bilingual persist.
  Touches: timedtext track fetch, subtitle renderer/styling pipeline, settings schema/locales.
  Acceptance: An opt-in second caption track renders below native captions with an independent language picker and clean unavailable-track fallback.
  Complexity: M
  Blocker: The independent enable/language controls require new localized schema entries, which in turn require committing the regenerated tracked `docs/i18n-coverage.md`; this run forbids staging that Markdown file.

- [ ] P2 — Allowlist hiding mode
  Why: Inverse channel filtering needs a deliberate mode control and an empty-list safety guard to avoid hiding all of YouTube accidentally.
  Evidence: BlockTube issue #133; FocusTube HN subscriptions-only demand.
  Touches: `extension/features/video-hider/`, settings schema/locales, blocked/allowed channel storage.
  Acceptance: An explicitly labelled mode toggle switches home/search/related filtering to allowlist semantics; card and settings management remain recoverable.
  Complexity: M
  Blocker: The safety-critical mode toggle and warning copy need new localized schema/UI strings, which require committing `docs/i18n-coverage.md`; this run forbids staging that Markdown file.

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

- [ ] P2 — Audio chain completion: auto-gain + high-pass
  Why: Astra already implements compressor-backed `audioNormalization`; the remaining independently selectable nodes are auto-gain and high-pass filtering.
  Evidence: Tweaks for YouTube feature set; `extension/ytkit-main.js` audio graph and `audioNormalization` setting.
  Touches: MAIN-world audio graph, isolated-world bridge, settings schema/locales.
  Acceptance: Auto-gain and high-pass nodes toggle independently with sane defaults, live-apply, and never double-connect across SPA navigation.
  Complexity: M
  Blocker: Independent node controls require new localized schema entries and therefore a committed regenerated `docs/i18n-coverage.md`, which this run forbids staging.

- [ ] P2 — Enforced Shorts daily limit
  Why: A Shorts-specific budget and hard-block/snooze policy are distinct from the existing all-video `dwDailyCapMin` setting.
  Evidence: TechCrunch 2025-10-22 Shorts timer coverage; Shorts Addiction Helper scripts; `extension/features/digital-wellbeing/`.
  Touches: digitalWellbeing runtime, Shorts route detection, settings schema/locales.
  Acceptance: Users configure daily Shorts minutes and hard-block versus five-minute snooze; usage resets at local midnight and the block is accessible.
  Complexity: M
  Blocker: The budget and enforcement-policy controls need new localized schema/UI strings and a committed `docs/i18n-coverage.md` update forbidden by this run.

- [ ] P2 — Hide AI surfaces pack
  Why: Independent controls are needed because Ask, Gemini, AI summaries, and context panels are separate surfaces with different user value.
  Evidence: Control Panel for YouTube; Remove YouTube Gemini buttons; Youtube without fact checking.
  Touches: `extension/early.css`, CSS feature registrations, selector packs, settings schema/locales.
  Acceptance: Independent toggles hide each verified surface with capture-backed selector canaries.
  Complexity: S
  Blocker: Independent toggles require new localized schema entries and fresh authenticated selector captures; this run forbids the required `docs/i18n-coverage.md` commit and active-desktop rules prohibit interactive capture.

- [ ] P2 — Notification menu controls: cap count + hide read
  Why: Count and read-state filtering are user-selected policies, not safe unconditional behavior under chronological sorting.
  Evidence: competitor notification options; `chronologicalNotifications` in `extension/ytkit.js`.
  Touches: chronologicalNotifications runtime, settings schema/locales.
  Acceptance: Independent options cap rendered notifications and hide read entries without observer/re-render loops.
  Complexity: S
  Blocker: No existing setting represents either policy; new localized controls require a committed `docs/i18n-coverage.md` update forbidden by this run.

- [ ] P2 — Comment intelligence pack
  Why: Language selection and duplicate expansion need discoverable controls; the existing `commentFilterRules` textarea already persists `@author` block rules but its localized contract does not cover language or duplicate behavior.
  Evidence: YouTube Comment Language Filter (GF 558814), Similar Comments Hider (hjk789), user-block scripts; `commentFilterManager` in `extension/ytkit.js`.
  Touches: comment filter runtime, settings-panel controls, settings schema/locales.
  Acceptance: A localized language allowlist hides other-language comments without network access; near duplicates collapse under an accessible expander; author blocks persist and remain manageable.
  Complexity: M
  Blocker: Shipping undiscoverable rule syntax or English-only expander copy would fail product/accessibility quality. The necessary localized controls require a committed regenerated `docs/i18n-coverage.md`, which this run forbids staging.

- [ ] P2 — Playlist power pack
  Why: Duration sorting, per-playlist resume, and auto-skip-watched are user-selected actions/policies that need clear accessible controls in the existing Playlist Enhancer toolbar.
  Evidence: Sort Youtube Playlist by Duration (KohGeek), playlists playback tracker (andrybak), Playlist Auto Skip Watched (neverlandeverland).
  Touches: playlistEnhancer runtime, resume storage, settings/localized UI copy.
  Acceptance: The playlist panel offers duration sort and last-video resume; an explicit persisted option auto-skips entries watched at least 90%.
  Complexity: M
  Blocker: The new toolbar actions and persisted auto-skip option require localized strings/schema entries and therefore a committed `docs/i18n-coverage.md` update forbidden by this run.

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
