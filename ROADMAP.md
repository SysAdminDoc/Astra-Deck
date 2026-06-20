# Roadmap — Astra Deck

## Research-Driven Additions

### P0 — Critical / Root-Cause

### P1 — Trust / Reliability / Distribution

(CWS submission, AMO submission, companion binary release moved to Roadmap_Blocked.md — require manual external actions.)

### P1 — Accessibility

### P2 — Quick Wins / Enhancement

- [ ] P2 — Monolith decomposition: SponsorBlock feature peel
  Why: SponsorBlock rendering, segment fetching, skip scheduling, and progress bar painting are self-contained (~800 lines) but inline in the 45.6K-line monolith. Peeling this into `features/sponsorblock/index.js` matches the established pattern (11 modules already peeled) and makes the code independently testable.
  Evidence: `tests/features/sponsorblock.test.js` already exists (93 lines) but tests source-string patterns, not module exports; `features/` directory has the established pattern.
  Touches: New `extension/features/sponsorblock/index.js`, `extension/ytkit.js` (delegate to module), `extension/manifest.json` (content_scripts), `tests/features/sponsorblock.test.js`
  Acceptance: SponsorBlock feature works identically; the peeled module is testable via direct import; monolith `ytkit.js` shrinks by ~800 lines.
  Complexity: M

- [ ] P2 — Monolith decomposition: DeArrow feature peel
  Why: DeArrow cache, title formatting, thumbnail replacement, and API fetching are self-contained (~600 lines) but inline. Same rationale as SponsorBlock peel.
  Evidence: `tests/features/dearrow.test.js` already exists (107 lines); peeling matches the `features/` pattern.
  Touches: New `extension/features/dearrow/index.js`, `extension/ytkit.js`, `extension/manifest.json`, `tests/features/dearrow.test.js`
  Acceptance: DeArrow feature works identically; monolith shrinks by ~600 lines; DeArrow-specific tests can import the module directly.
  Complexity: M

- [ ] P2 — Monolith decomposition: Download UI peel
  Why: Download popup, progress panel, health panel, stream links panel, and Cobalt fallback total ~1500 lines. They have clear boundaries and a single integration surface (`ytKitDownload`).
  Evidence: Download UI is the largest unpelled feature domain; `MediaDLManager` singleton is already semi-isolated.
  Touches: New `extension/features/download-ui/index.js`, `extension/ytkit.js`, `extension/manifest.json`
  Acceptance: Download flows work identically; monolith shrinks by ~1500 lines.
  Complexity: L

- [ ] P2 — Companion module split
  Why: `astra_downloader/astra_downloader.py` (5.3K lines) mixes Flask routes, Qt GUI, download management, yt-dlp subprocess control, config management, and health probes in a single file. Splitting improves testability and maintainability.
  Evidence: H26 audit noted threading concerns; `test_astra_downloader.py` must mock deeply to test individual concerns.
  Touches: `astra_downloader/astra_downloader.py` (split into `routes.py`, `downloader.py`, `gui.py`, `health.py`, `config.py`), `astra_downloader/test_astra_downloader.py`
  Acceptance: All 111 Python tests pass; companion starts and serves downloads identically; each module is independently importable for testing.
  Complexity: L

- [ ] P2 — Companion auto-provisions Deno runtime
  Why: yt-dlp >= 2026.04 requires an external JS runtime and the companion already auto-bootstraps yt-dlp.exe and ffmpeg.exe on first run — Deno is the one remaining manual step (winget/installer), surfaced only as a warning pill.
  Evidence: `astra_downloader/astra_downloader.py` `_bootstrap()` (yt-dlp/ffmpeg auto-download with SHA sidecars) vs `probe_deno_runtime()` (probe-only); yt-dlp 2025.11.12 release notes (external JS runtime required).
  Touches: `astra_downloader/astra_downloader.py` (download pinned Deno portable zip from GitHub releases with SHA256 verification into `%LOCALAPPDATA%\AstraDownloader`, prepend to subprocess PATH), `astra_downloader/test_astra_downloader.py`, `/health` denoRuntime payload (`source: bundled|system`)
  Acceptance: On a machine without Deno, the companion offers/performs a one-click Deno provision; `/health.denoRuntime.installed` flips true without any manual install; yt-dlp subprocesses resolve the bundled runtime; checksum failure aborts cleanly.
  Complexity: M

- [ ] P2 — Settings PIN protection
  Why: Shared-device and child-safety users need a way to lock the settings panel. BlockTube ships password protection; it's a recurring community request. The settings panel currently opens for anyone on the browser profile.
  Evidence: github.com/amitbl/blocktube (password protection feature); community requests on Reddit for extension locking; `extension/ytkit.js` settings panel has no access gate.
  Touches: `extension/ytkit.js` (PIN entry gate before settings panel open, PIN set/change/clear flow), `extension/popup.js` (PIN gate on export/import/reset), `core/storage.js` (store hashed PIN in chrome.storage.local), settings schema + locales
  Acceptance: When PIN is set, opening the settings panel or popup management actions requires correct PIN entry; PIN stored as bcrypt/scrypt hash, not plaintext; "Forgot PIN" clears all settings as a recovery path; PIN is excluded from settings export by credential scrub.
  Complexity: S

- [ ] P2 — Onboarding preset profiles
  Why: The 200+ settings surface overwhelms new users. Curated preset bundles ("Privacy-focused", "Researcher", "Power User", "Minimal") would let users configure 20-40 settings in one action, dramatically lowering the discovery barrier.
  Evidence: `settingsProfiles` already supports save/load/delete/export/import; `feedTriageProfile` and `lowPowerProfile` are existing recipe toggles that prove the pattern; PocketTube and Enhancer for YouTube ship curated defaults.
  Touches: `extension/ytkit.js` (preset definitions, one-click apply UI in settings panel), `extension/popup.js` (preset selector in popup for first-run), settings schema
  Acceptance: At least 3 named presets ship; selecting a preset applies its settings bundle and creates a backup snapshot (like feedTriageProfile); toggling off restores prior values; presets are read-only (users customize via save-as).
  Complexity: S

- [ ] P2 — Document PiP cross-browser expansion (Firefox 151+)
  Why: Firefox 151 (May 2026) shipped Document Picture-in-Picture API support. The existing `popOutPlayer` feature uses Document PiP on Chrome with a fallback — Firefox can now use the native path, enabling custom HTML controls in the PiP window.
  Evidence: developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API (Firefox 151+ support); `extension/ytkit.js` popOutPlayer feature; `core/capability-probe.js` (existing capability detection).
  Touches: `extension/ytkit.js` (remove Firefox fallback branch in popOutPlayer, ensure cross-browser Document PiP works), `core/capability-probe.js` (update Document PiP probe), tests
  Acceptance: popOutPlayer uses Document PiP API natively on Firefox 151+; custom controls render in PiP window on both Chrome and Firefox; fallback still works on older Firefox.
  Complexity: S

- [ ] P2 — Competitor migration documentation
  Why: Iridium (1,300 GitHub stars) was archived Jan 2026 with orphaned users seeking alternatives. Enhancer for YouTube abandoned Firefox (510K users) in Aug 2025. Landing pages with settings-import guides would capture these users at zero feature development cost.
  Evidence: github.com/ParticleCore/Iridium (archived Jan 31, 2026); ghacks.net (Enhancer for YouTube Firefox discontinuation Aug 2025, HN item 44962001); RYD trust incident (HN item 45696329).
  Touches: `docs/migration-from-iridium.md`, `docs/migration-from-enhancer.md` (feature mapping tables + import instructions), README.md (migration links)
  Acceptance: Each migration doc maps the competitor's top features to Astra Deck equivalents; includes step-by-step install instructions; linked from README "Related" section.
  Complexity: S

- [ ] P2 — Supply chain transparency documentation
  Why: The ShadyPanda supply chain attack (Dec 2025) compromised 4.3M Chrome/Edge users through sleeper extensions. Astra Deck's open-source code, SBOM, attestation, no-silent-update architecture, and credential scrub are genuine differentiators — but not documented as a trust page for end users.
  Evidence: thehackernews.com/2025/12 (ShadyPanda attack); existing SBOM/attestation/release-manifest pipeline; `SECURITY.md` covers vulnerability reporting but not supply chain posture.
  Touches: `docs/supply-chain-transparency.md` (new), `README.md` (link in Security section)
  Acceptance: Page documents: open-source audit trail, SBOM generation, GitHub attestation, no obfuscation, credential scrub on export, profile-split permissions, and how users can verify release integrity. Linked from README.
  Complexity: S

### P2 — Observability / Developer Experience

(Visual regression testing moved to Roadmap_Blocked.md — requires headless browser environment.)

### P3 — Later / Under Consideration

- [ ] P3 — SharedAudio port to extension (MAIN world audio processing)
  Why: volumeBoost, skipSilence, audioNormalization, and audioEqualizer are userscript-only because they require MAIN world Web Audio API access. Tweaks for YouTube ships compressor, auto gain, and pan in-extension. The MAIN world bridge (`ytkit-main.js`) already exists for codec filtering.
  Evidence: CLAUDE.md "Not Yet Ported to Extension" section; Tweaks for YouTube features page lists advanced audio processing.
  Touches: `extension/ytkit-main.js` (MAIN world audio graph), `extension/ytkit.js` (data-attribute bridge), `extension/manifest.json`
  Acceptance: At least volumeBoost and audioNormalization work in the extension build via MAIN world bridge; feature toggles in settings panel.
  Complexity: XL

- [ ] P3 — Chrome Prompt API (Gemini Nano) for transcript Q&A
  Why: Chrome 138+ ships the Prompt API stable for extensions. Astra Deck already uses the Summarizer API for `localAiSummary`. The Prompt API would enable on-device transcript Q&A without BYO keys.
  Evidence: Chrome Prompt API docs; `extension/ytkit.js` already checks `window.Summarizer || window.ai?.summarizer`.
  Touches: `extension/ytkit.js` (new feature or enhancement to `localAiSummary`), settings schema
  Acceptance: When Prompt API available, user can ask questions about the current video's transcript; responses generated on-device; graceful fallback when unavailable.
  Complexity: M

- [ ] P3 — DeArrow submission and voting (write-side)
  Why: Astra Deck consumes DeArrow titles/thumbnails but cannot contribute or vote, so users who spot bad replacements have no recourse; the official DeArrow extension supports right-click submit and thumbs up/down voting.
  Evidence: github.com/ajayyy/DeArrow (submission/voting flow, requires a locally generated private userID); Astra Deck DeArrow integration is fetch-and-cache only.
  Touches: `extension/ytkit.js` (DeArrow UI: vote buttons on replaced titles, submit dialog), `extension/background.js` + `core/data-flow.js` (POST endpoints on sponsor.ajay.app, userID generation/storage with credential-scrub exemption review), privacy policy text
  Acceptance: Users can vote on a replaced title and submit a new title/timestamp thumbnail; the generated userID never leaves DeArrow requests and is excluded from settings exports; feature is off by default.
  Complexity: M

- [ ] P3 — CSS Anchor Positioning for tooltip/popover UI
  Why: CSS Anchor Positioning reached Baseline 2026 (Chrome 125+, Firefox 147+, Safari 26+). Astra Deck's tooltips, popovers, and contextual panels currently use JavaScript-based positioning. Migrating to native CSS anchoring eliminates JS calculation overhead and improves maintainability.
  Evidence: css-tricks.com/interop-2026 (Baseline 2026); `extension/ytkit.js` uses absolute positioning + getBoundingClientRect for download popup, speed popup, settings panel tooltips.
  Touches: `extension/ytkit.js` (replace JS positioning with CSS anchor-name/position-anchor), `extension/popup.css` (anchor-positioned tooltips), `extension/early.css`
  Acceptance: All extension-injected tooltips and popovers use CSS Anchor Positioning; JS positioning fallback for browsers below the baseline; no visual regression.
  Complexity: M

- [ ] P3 — View Transitions API for SPA navigation smoothness
  Why: View Transitions reached Baseline 2025 for same-document transitions (cross-browser). YouTube's SPA navigation causes Astra Deck to teardown/reinit UI elements abruptly. View Transitions would smooth these transitions.
  Evidence: web.dev/blog/web-platform-12-2025 (Baseline 2025); `core/navigation.js` handles `yt-navigate-finish` and `popstate`.
  Touches: `core/navigation.js` (wrap UI teardown/rebuild in `document.startViewTransition()`), `extension/ytkit.js` (feature UI elements opt into view-transition-name)
  Acceptance: Astra Deck UI elements (settings panel, download popup, subscription toolbar) transition smoothly on YouTube SPA navigation; no visual regression on browsers without support.
  Complexity: M

- [ ] P3 — Chrome Writer/Rewriter API for comment drafting
  Why: Chrome's Writer and Rewriter APIs (currently Developer Trial) offer on-device text generation and refinement. When stable, they could power comment drafting assistance without BYO keys.
  Evidence: developer.chrome.com/docs/ai/built-in-apis (Writer/Rewriter in Developer Trial); `extension/ytkit.js` already probes `window.Summarizer`.
  Touches: `extension/ytkit.js` (comment composer enhancement), `core/capability-probe.js` (Writer/Rewriter detection), settings schema
  Acceptance: When Writer API is available, a "Draft" button appears in YouTube's comment composer; responses generated on-device; graceful fallback when unavailable; feature off by default.
  Complexity: M

- [ ] P3 — Subscription group CSV export
  Why: Subscription groups export as JSON only. CSV is more accessible for spreadsheet users who want to audit, share, or process their subscription data externally.
  Evidence: pockettube.io (CSV export feature); `extension/ytkit.js` subscription groups already export schemaVersion 2 JSON.
  Touches: `extension/ytkit.js` (add CSV export option alongside JSON in subscription groups toolbar), `core/` (RFC 4180 CSV serializer if not already present)
  Acceptance: Subscription groups can be exported as CSV with columns: group name, channel name, channel handle, channel URL; CSV follows RFC 4180; special characters properly escaped.
  Complexity: S

